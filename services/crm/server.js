import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import axios from 'axios';
import { generateAiInsights, improveMessageText } from './openai-service.js';

dotenv.config({ path: '../../.env' });

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────
// DATABASE LAYER — Prisma-first, in-memory fallback
// ─────────────────────────────────────────────────────────
let prisma = null;
let usingPrisma = false;

async function initDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && dbUrl.trim() !== '') {
    try {
      const { PrismaClient } = await import('@prisma/client');
      prisma = new PrismaClient();
      await prisma.$connect();
      usingPrisma = true;
      console.log('✅ Connected to Supabase PostgreSQL via Prisma');
    } catch (err) {
      console.warn('⚠️  Prisma connection failed, using in-memory fallback:', err.message);
      usingPrisma = false;
    }
  } else {
    console.log('ℹ️  No DATABASE_URL set — using in-memory database');
  }
}

// In-memory fallback store (used when no DB configured)
const memDb = {
  customers: [
    { id: crypto.randomUUID(), name: 'Alice VIP', email: 'alice@example.com', phone: '+919876543210', predicted_preferred_channel: 'EMAIL', is_vip_rigid_routing: true },
    { id: crypto.randomUUID(), name: 'Bob Normal', email: null, phone: null, predicted_preferred_channel: 'WHATSAPP', is_vip_rigid_routing: false },
    { id: crypto.randomUUID(), name: 'Charlie SMS', email: null, phone: '+919123456789', predicted_preferred_channel: 'SMS', is_vip_rigid_routing: false },
    { id: crypto.randomUUID(), name: 'Diana Multi', email: 'diana@company.com', phone: '+918765432100', predicted_preferred_channel: 'WHATSAPP', is_vip_rigid_routing: false },
    { id: crypto.randomUUID(), name: 'Eve RCS', email: 'eve@startup.io', phone: '+917654321098', predicted_preferred_channel: 'RCS', is_vip_rigid_routing: false },
  ],
  orders: [],
  campaigns: [],
  messageLogs: [],
  tokenLedger: [],
};

// ─── Unified Data Access Layer ───
const db = {
  // Customers
  async getCustomers() {
    if (usingPrisma) return prisma.customer.findMany();
    return memDb.customers;
  },

  async createCustomer(data) {
    if (usingPrisma) return prisma.customer.create({ data });
    const c = { id: crypto.randomUUID(), ...data };
    memDb.customers.push(c);
    return c;
  },

  // Campaigns
  async upsertCampaign(id, data) {
    if (usingPrisma) {
      return prisma.campaign.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    }
    let camp = memDb.campaigns.find(c => c.id === id);
    if (!camp) {
      camp = { id, ...data };
      memDb.campaigns.push(camp);
    } else {
      Object.assign(camp, data);
    }
    return camp;
  },

  // Message Logs
  async createMessageLog(data) {
    if (usingPrisma) return prisma.messageLog.create({ data });
    const log = { id: crypto.randomUUID(), ...data, last_updated_at: new Date().toISOString() };
    memDb.messageLogs.push(log);
    return log;
  },

  async findMessageLogByKey(idempotency_key) {
    if (usingPrisma) return prisma.messageLog.findUnique({ where: { idempotency_key } });
    return memDb.messageLogs.find(l => l.idempotency_key === idempotency_key) || null;
  },

  async updateMessageLog(idempotency_key, data) {
    if (usingPrisma) {
      return prisma.messageLog.update({ where: { idempotency_key }, data });
    }
    const log = memDb.messageLogs.find(l => l.idempotency_key === idempotency_key);
    if (log) Object.assign(log, data, { last_updated_at: new Date().toISOString() });
    return log;
  },

  async getAllMessageLogs() {
    if (usingPrisma) return prisma.messageLog.findMany({ orderBy: { last_updated_at: 'desc' } });
    return [...memDb.messageLogs].reverse();
  },

  // Token Ledger
  async createTokenLedger(data) {
    if (usingPrisma) return prisma.tokenLedger.create({ data });
    const entry = { id: crypto.randomUUID(), ...data, created_at: new Date().toISOString() };
    memDb.tokenLedger.push(entry);
    return entry;
  },

  async getTokenLedgerAll() {
    if (usingPrisma) return prisma.tokenLedger.findMany();
    return memDb.tokenLedger;
  },
};

// ─────────────────────────────────────────────────────────
// SERVER START
// ─────────────────────────────────────────────────────────
const PORT = process.env.CRM_PORT || 5001;
const server = app.listen(PORT, () => console.log(`🚀 CRM Service on port ${PORT}`));

// Broadcast is now a no-op since frontend uses Supabase Realtime
function broadcast(type, payload) {
  // FinOps could be moved to Supabase Realtime in the future
}

// ─────────────────────────────────────────────────────────
// SMART ROUTING ENGINE
// ─────────────────────────────────────────────────────────
const STATUS_WEIGHTS = { FAILED: 0, PENDING: 1, SENT: 2, DELIVERED: 3, OPENED: 4, CLICKED: 5 };

function hasContactInfo(customer, channel) {
  if (channel === 'EMAIL') return !!customer.email;
  return !!customer.phone; // WHATSAPP, SMS, RCS all need phone
}

function resolveChannel(customer, requestedChannel) {
  // VIP: strict — never fallback
  if (customer.is_vip_rigid_routing) {
    return { channel: requestedChannel, fallback: false, reason: 'VIP rigid routing' };
  }

  // Has contact info for requested channel?
  if (hasContactInfo(customer, requestedChannel)) {
    return { channel: requestedChannel, fallback: false, reason: null };
  }

  // Fallback to predicted preferred
  const preferred = customer.predicted_preferred_channel;
  if (hasContactInfo(customer, preferred)) {
    return { channel: preferred, fallback: true, reason: `Missing ${requestedChannel} info → fallback to ${preferred}` };
  }

  // Ultimate fallback: try any channel that works
  const channels = ['EMAIL', 'WHATSAPP', 'SMS', 'RCS'];
  for (const ch of channels) {
    if (hasContactInfo(customer, ch)) {
      return { channel: ch, fallback: true, reason: `No ${requestedChannel} or ${preferred} → fallback to ${ch}` };
    }
  }

  // Nothing works — will result in FAILED
  return { channel: requestedChannel, fallback: false, reason: 'No valid contact info for any channel' };
}

// ─────────────────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: usingPrisma ? 'prisma' : 'in-memory', uptime: process.uptime() });
});

// Get all customers
app.get('/api/customers', async (req, res) => {
  try {
    const customers = await db.getCustomers();
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all message logs
app.get('/api/logs', async (req, res) => {
  try {
    const logs = await db.getAllMessageLogs();
    
    // Enrich logs with customer details
    const customers = await db.getCustomers();
    const custMap = {};
    customers.forEach(c => custMap[c.id] = c);
    
    const enrichedLogs = logs.map(log => {
      const customer = custMap[log.customer_id] || {};
      return {
        ...log,
        customer_name: customer.name || 'Unknown',
        predicted_preferred_channel: customer.predicted_preferred_channel || 'UNKNOWN',
        is_vip_rigid_routing: customer.is_vip_rigid_routing || false
      };
    });
    
    res.json(enrichedLogs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DISPATCH ───
app.post('/api/dispatch', async (req, res) => {
  const { campaign_id, target_channel, message_text } = req.body;
  if (!campaign_id || !target_channel) {
    return res.status(400).json({ error: 'campaign_id and target_channel are required' });
  }

  try {
    await db.upsertCampaign(campaign_id, {
      name: `Campaign ${campaign_id}`,
      status: 'ACTIVE',
      target_segment_query: `channel=${target_channel}`,
      ai_generated: false,
    });

    const customers = await db.getCustomers();
    const results = [];

    for (const customer of customers) {
      const routing = resolveChannel(customer, target_channel);

      if (routing.reason) {
        console.log(`[Routing] ${customer.name}: ${routing.reason}`);
      }

      const idempotency_key = crypto.createHash('sha256')
        .update(`${campaign_id}_${customer.id}_${routing.channel}`)
        .digest('hex');

      const canDeliver = hasContactInfo(customer, routing.channel);
      const initialStatus = canDeliver ? 'PENDING' : 'FAILED';

      const logEntry = await db.createMessageLog({
        campaign_id,
        customer_id: customer.id,
        channel: routing.channel,
        current_status: initialStatus,
        status_sequence_number: 1,
        idempotency_key,
      });

      // Enrich with customer name for the frontend
      const enrichedLog = { 
        ...logEntry, 
        customer_name: customer.name,
        predicted_preferred_channel: customer.predicted_preferred_channel,
        is_vip_rigid_routing: customer.is_vip_rigid_routing
      };
      broadcast('LOG_UPDATE', enrichedLog);
      results.push(enrichedLog);

      // Fire to Mock Channel Service if deliverable
      if (canDeliver) {
        axios.post('http://localhost:5002/send', {
          idempotency_key,
          campaign_id,
          customer_id: customer.id,
          channel: routing.channel,
        }).catch(err => console.error(`[MockChannel] Error:`, err.message));
      }
    }

    res.json({ message: 'Dispatch completed', count: results.length, results });
  } catch (err) {
    console.error('[Dispatch] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── WEBHOOK RECEIPT (Out-of-Order State Engine) ───
app.post('/api/webhook', async (req, res) => {
  const { idempotency_key, status } = req.body;
  if (!idempotency_key || !status) {
    return res.status(400).json({ error: 'idempotency_key and status required' });
  }

  try {
    const log = await db.findMessageLogByKey(idempotency_key);
    if (!log) return res.status(404).json({ error: 'Log not found' });

    const currentWeight = STATUS_WEIGHTS[log.current_status];
    const newWeight = STATUS_WEIGHTS[status];

    // Reject state regressions (out-of-order protection)
    if (newWeight <= currentWeight && status !== 'FAILED') {
      console.log(`[Webhook] ❌ Regression rejected: ${log.current_status} → ${status} (key: ${idempotency_key.substring(0, 12)}…)`);
      return res.status(200).json({ action: 'rejected', reason: 'state_regression' });
    }

    // Accept state progression
    const updated = await db.updateMessageLog(idempotency_key, {
      current_status: status,
      status_sequence_number: log.status_sequence_number + 1,
    });

    console.log(`[Webhook] ✅ ${log.current_status} → ${status} (key: ${idempotency_key.substring(0, 12)}…)`);

    // Broadcast to frontend
    const customers = await db.getCustomers();
    const customer = customers.find(c => c.id === updated.customer_id);
    broadcast('LOG_UPDATE', { 
      ...updated, 
      customer_name: customer?.name || 'Unknown',
      predicted_preferred_channel: customer?.predicted_preferred_channel || 'UNKNOWN',
      is_vip_rigid_routing: customer?.is_vip_rigid_routing || false
    });

    res.status(200).json({ action: 'accepted', status });
  } catch (err) {
    console.error('[Webhook] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── AI INSIGHTS ───
app.post('/api/insights', async (req, res) => {
  try {
    const customers = await db.getCustomers();
    const logs = await db.getAllMessageLogs();
    // Slice logs to last 100 to fit in context window and avoid token limits
    const recentLogs = logs.slice(0, 100);
    const prompt = `You are a CRM Data Analyst. Analyze this dataset and return a strict JSON object with an "insights" array. Each insight must have: trend, suggested_strategy, audience_segment, message_draft. Customers: ${JSON.stringify(customers)}. Recent Message History: ${JSON.stringify(recentLogs)}`;

    const result = await generateAiInsights({ prompt, dbLayer: db });

    // Refresh finops stats and broadcast
    broadcast('FINOPS_UPDATE', await getFinOpsStats());

    res.json(result);
  } catch (err) {
    console.error('[Insights] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── FINOPS STATS ───
async function getFinOpsStats() {
  const ledger = await db.getTokenLedgerAll();
  const totalTokens = ledger.reduce((s, i) => s + i.prompt_tokens + i.completion_tokens, 0);
  const totalSpend = ledger.reduce((s, i) => s + i.calculated_cost, 0);
  const cacheHits = ledger.filter(i => i.execution_type === 'LOCAL_CACHE').length;
  const totalCalls = ledger.length;
  const cacheHitRate = totalCalls === 0 ? 0 : (cacheHits / totalCalls) * 100;
  return { totalTokens, totalSpend, cacheHitRate, totalCalls };
}

app.get('/api/finops', async (req, res) => {
  try {
    res.json(await getFinOpsStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── IMPROVE MESSAGE ───
app.post('/api/improve', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });
    const improved = await improveMessageText({ text });
    res.json({ improved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Startup ───
initDatabase();
