import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import axios from 'axios';
import { generateAiInsights } from './openai-service.js';

dotenv.config({ path: '../../.env' });

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------
// DATABASE FALLBACK LOGIC
// ---------------------------------------------------------
const inMemoryDb = {
  customers: [
    { id: 'c1', name: 'Alice VIP', email: 'alice@example.com', phone: null, predicted_preferred_channel: 'EMAIL', is_vip_rigid_routing: true },
    { id: 'c2', name: 'Bob Normal', email: null, phone: null, predicted_preferred_channel: 'WHATSAPP', is_vip_rigid_routing: false },
    { id: 'c3', name: 'Charlie SMS', email: null, phone: '123456789', predicted_preferred_channel: 'SMS', is_vip_rigid_routing: false }
  ],
  campaigns: [],
  messageLogs: [],
  tokenLedger: []
};

// ---------------------------------------------------------
// WEBSOCKET SETUP
// ---------------------------------------------------------
const port = 5001;
const server = app.listen(port, () => {
  console.log(`CRM Service running on port ${port}`);
});
const wss = new WebSocketServer({ server });

function broadcastUpdate(type, payload) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify({ type, payload }));
    }
  });
}

// ---------------------------------------------------------
// ROUTING ENGINE & UTILS
// ---------------------------------------------------------
const STATUS_WEIGHTS = {
  'FAILED': 0,
  'PENDING': 1,
  'SENT': 2,
  'DELIVERED': 3,
  'OPENED': 4,
  'CLICKED': 5
};

// Check if customer has contact info for a channel
function hasContactInfoForChannel(customer, channel) {
  if (channel === 'EMAIL') return !!customer.email;
  if (channel === 'WHATSAPP' || channel === 'SMS' || channel === 'RCS') return !!customer.phone;
  return false;
}

// ---------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------

app.get('/api/customers', (req, res) => {
  res.json(inMemoryDb.customers);
});

// Trigger a Dispatch Loop
app.post('/api/dispatch', async (req, res) => {
  const { campaign_id, target_channel, message_text } = req.body;
  
  if (!inMemoryDb.campaigns.find(c => c.id === campaign_id)) {
    inMemoryDb.campaigns.push({ id: campaign_id, name: 'Blast', status: 'ACTIVE' });
  }

  // Loop over all customers
  for (const customer of inMemoryDb.customers) {
    let selectedChannel = target_channel;

    // SMART ROUTING ENGINE
    if (customer.is_vip_rigid_routing) {
      // VIP Strict: do not fallback.
      selectedChannel = target_channel;
    } else {
      // Dynamic fallback
      if (!hasContactInfoForChannel(customer, selectedChannel)) {
        console.log(`[Smart Routing] Missing ${selectedChannel} for ${customer.name}, falling back to ${customer.predicted_preferred_channel}`);
        selectedChannel = customer.predicted_preferred_channel;
        
        // Secondary check on fallback
        if (!hasContactInfoForChannel(customer, selectedChannel)) {
            selectedChannel = 'EMAIL'; // Default ultimate fallback
        }
      }
    }

    const idempotency_key = crypto.createHash('sha256').update(`${campaign_id}_${customer.id}_${selectedChannel}`).digest('hex');

    // Check if we can proceed based on contact info validity
    let initialStatus = 'PENDING';
    if (!hasContactInfoForChannel(customer, selectedChannel)) {
      initialStatus = 'FAILED';
    }

    const logEntry = {
      id: crypto.randomUUID(),
      campaign_id,
      customer_id: customer.id,
      customer_name: customer.name,
      channel: selectedChannel,
      current_status: initialStatus,
      status_sequence_number: 1,
      idempotency_key,
      last_updated_at: new Date().toISOString()
    };
    inMemoryDb.messageLogs.push(logEntry);
    broadcastUpdate('LOG_UPDATE', logEntry);

    // Call Mock Channel Service if PENDING
    if (initialStatus === 'PENDING') {
      try {
        await axios.post('http://localhost:5002/send', {
          idempotency_key,
          campaign_id,
          customer_id: customer.id,
          channel: selectedChannel
        });
      } catch (e) {
        console.error(`Mock channel service error:`, e.message);
      }
    }
  }

  res.json({ message: 'Dispatch started' });
});

// Webhook Receipt Endpoint
app.post('/api/webhook', (req, res) => {
  const { idempotency_key, status } = req.body;

  const logIndex = inMemoryDb.messageLogs.findIndex(l => l.idempotency_key === idempotency_key);
  if (logIndex === -1) return res.status(404).send('Log not found');

  const log = inMemoryDb.messageLogs[logIndex];
  
  // OUT-OF-ORDER STATE VALIDATION
  const currentWeight = STATUS_WEIGHTS[log.current_status];
  const newWeight = STATUS_WEIGHTS[status];

  if (newWeight <= currentWeight && status !== 'FAILED') {
    console.log(`[Webhook] State regression rejected. Key: ${idempotency_key}. Current: ${log.current_status}, Incoming: ${status}`);
    return res.status(200).send('Ignored regression');
  }

  // Update State
  log.current_status = status;
  log.status_sequence_number += 1;
  log.last_updated_at = new Date().toISOString();

  inMemoryDb.messageLogs[logIndex] = log;
  
  // Emit to Frontend
  broadcastUpdate('LOG_UPDATE', log);

  res.status(200).send('OK');
});

// AI Insights Generation Route
app.post('/api/insights', async (req, res) => {
  const prompt = `Analyze this dataset and give actionable CRM insights: ${JSON.stringify(inMemoryDb.customers)}`;
  const result = await generateAiInsights({ prompt, inMemoryDb });
  broadcastUpdate('FINOPS_UPDATE', getFinOpsStats());
  res.json(result);
});

// Helper for Observability Stats
function getFinOpsStats() {
  const totalTokens = inMemoryDb.tokenLedger.reduce((sum, item) => sum + item.prompt_tokens + item.completion_tokens, 0);
  const totalSpend = inMemoryDb.tokenLedger.reduce((sum, item) => sum + item.calculated_cost, 0);
  const cacheHits = inMemoryDb.tokenLedger.filter(i => i.execution_type === 'LOCAL_CACHE').length;
  const totalCalls = inMemoryDb.tokenLedger.length;
  const cacheHitRate = totalCalls === 0 ? 0 : (cacheHits / totalCalls) * 100;

  return { totalTokens, totalSpend, cacheHitRate };
}

app.get('/api/finops', (req, res) => {
  res.json(getFinOpsStats());
});
