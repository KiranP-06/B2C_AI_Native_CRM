import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(cors());
app.use(express.json());

// In-Memory Anti-Spam Guard
const seenKeys = new Set();

app.post('/send', (req, res) => {
  const { idempotency_key, campaign_id, customer_id, channel } = req.body;

  // Idempotency Check
  if (seenKeys.has(idempotency_key)) {
    console.log(`[MockChannel] Duplicate key ignored: ${idempotency_key}`);
    return res.status(202).json({ status: 'ignored_duplicate' });
  }

  seenKeys.add(idempotency_key);
  res.status(202).json({ status: 'accepted' });

  // Simulate staggered webhook events with random jitter
  const triggerWebhook = async (status, delayMs) => {
    // Add ±200ms jitter
    const jitter = Math.floor(Math.random() * 400) - 200;
    const finalDelay = Math.max(0, delayMs + jitter);

    setTimeout(async () => {
      try {
        await axios.post('http://localhost:5001/api/webhook', {
          idempotency_key,
          status
        });
        console.log(`[MockChannel] Fired Webhook: ${status} for ${customer_id}`);
      } catch (err) {
        console.error(`[MockChannel] Failed to fire webhook to CRM:`, err.message);
      }
    }, finalDelay);
  };

  // Simulate a realistic marketing funnel drop-off
  const rand = Math.random();
  
  // 5% fail immediately
  if (rand < 0.05) {
    triggerWebhook('FAILED', 500);
    return;
  }
  
  triggerWebhook('SENT', 1000);
  
  // 90% delivered
  if (rand < 0.95) {
    triggerWebhook('DELIVERED', 3000);
    
    // 50% opened
    if (rand < 0.50) {
      triggerWebhook('OPENED', 6000);
      
      // 20% clicked
      if (rand < 0.20) {
        triggerWebhook('CLICKED', 10000);
      }
    }
  } else {
    // 5% fail after being sent
    triggerWebhook('FAILED', 4000);
  }
});

const port = 5002;
app.listen(port, () => {
  console.log(`Mock Channel Service running on port ${port}`);
});
