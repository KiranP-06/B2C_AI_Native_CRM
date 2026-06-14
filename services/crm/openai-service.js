import crypto from 'crypto';

// ─── In-Memory LLM Response Cache ───
const localCache = new Map();

// Cost constants (GPT-3.5 Turbo pricing)
const INPUT_COST_PER_1K  = 0.000075;
const OUTPUT_COST_PER_1K = 0.00025;

function calculateCost(promptTokens, completionTokens) {
  return (promptTokens * INPUT_COST_PER_1K / 1000) + (completionTokens * OUTPUT_COST_PER_1K / 1000);
}

// ─── High-Quality Mock Insights ───
function getMockInsights() {
  return {
    insights: [
      {
        trend: "VIP customers show 40% higher lifetime value but 25% lower campaign engagement rate this quarter.",
        suggested_strategy: "Launch an exclusive VIP loyalty program with personalized offers and early access to new products.",
        audience_segment: "VIP Customers (is_vip_rigid_routing = true)",
        message_draft: "Hi {{name}}, as a valued VIP member, enjoy exclusive early access to our summer collection with 25% off. Use code: VIP25"
      },
      {
        trend: "WhatsApp channel shows 3.2x higher open rates compared to email across all segments.",
        suggested_strategy: "Shift primary campaign delivery to WhatsApp with rich media attachments for maximum engagement.",
        audience_segment: "All Customers (Channel = WHATSAPP)",
        message_draft: "Hey {{name}}! 🎉 We have exciting offers just for you. Check out our latest deals and save big this week!"
      },
      {
        trend: "Customers with both email and phone on file have 60% higher conversion rates on multi-channel campaigns.",
        suggested_strategy: "Run a data enrichment campaign to capture missing contact fields from single-channel customers.",
        audience_segment: "Incomplete Profile Customers",
        message_draft: "Hi {{name}}, update your profile to unlock exclusive rewards! Add your {{missing_field}} to get 10% off your next order."
      },
      {
        trend: "SMS delivery rates peak between 10 AM - 2 PM local time with 95% read rates within 3 minutes.",
        suggested_strategy: "Schedule all SMS campaigns within the 10AM-2PM window to maximize time-sensitive offer uptake.",
        audience_segment: "SMS Subscribers (Channel = SMS)",
        message_draft: "{{name}}, flash sale alert! 🔥 50% off for the next 2 hours only. Shop now: {{link}}"
      }
    ]
  };
}

// ─── Main Export ───
export async function generateAiInsights({ prompt, forceLiveCall = false, useCache = true, manualOverride = null, dbLayer = null }) {

  // Manual override path
  if (manualOverride) {
    if (dbLayer) {
      await dbLayer.createTokenLedger({
        prompt_tokens: 0, completion_tokens: 0,
        calculated_cost: 0, execution_type: 'MANUAL_OVERRIDE',
      });
    }
    return { data: manualOverride, cost: 0, tokens: 0, executionType: 'MANUAL_OVERRIDE' };
  }

  // MD5 hash for cache key
  const hashKey = crypto.createHash('md5').update(prompt).digest('hex');

  // Cache hit path
  if (useCache && !forceLiveCall && localCache.has(hashKey)) {
    console.log(`[FinOps] Cache HIT (md5: ${hashKey.substring(0, 8)}…)`);
    if (dbLayer) {
      await dbLayer.createTokenLedger({
        prompt_tokens: 0, completion_tokens: 0,
        calculated_cost: 0, execution_type: 'LOCAL_CACHE',
      });
    }
    return { data: localCache.get(hashKey), cost: 0, tokens: 0, executionType: 'LOCAL_CACHE' };
  }

  // Live LLM call
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  let data;
  let promptTokens = 0;
  let completionTokens = 0;
  let executionType = 'LIVE_LLM';

  try {
    if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('1234qrst')) {
      throw new Error('No valid OPENAI_API_KEY configured');
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'HTTP-Referer': 'http://localhost:5173', // OpenRouter required header
        'X-Title': 'AI-Native CRM', // OpenRouter optional header
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a CRM Data Analyst. Always respond with strict JSON only.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) throw new Error(`OpenAI API ${response.status}: ${response.statusText}`);

    const json = await response.json();
    data = JSON.parse(json.choices[0].message.content);
    promptTokens = json.usage.prompt_tokens;
    completionTokens = json.usage.completion_tokens;
    console.log(`[FinOps] Live LLM call — ${promptTokens} prompt + ${completionTokens} completion tokens`);
  } catch (err) {
    console.warn(`[FinOps] LLM unavailable (${err.message}), using mock insights`);
    data = getMockInsights();
    promptTokens = Math.floor(prompt.length / 4);
    completionTokens = Math.floor(JSON.stringify(data).length / 4);
  }

  const calculatedCost = calculateCost(promptTokens, completionTokens);
  localCache.set(hashKey, data);

  if (dbLayer) {
    await dbLayer.createTokenLedger({
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      calculated_cost: calculatedCost,
      execution_type: executionType,
    });
  }

  return { data, cost: calculatedCost, tokens: promptTokens + completionTokens, executionType };
}

export async function improveMessageText({ text }) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('1234qrst')) {
    return "VIP Exclusive: " + text + " - Act now for 20% off!"; // Mock improvement
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'AI-Native CRM',
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an expert marketing copywriter. Improve the given message to be more engaging, professional, and persuasive. Return ONLY the improved text, no quotes or conversational filler.' },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!response.ok) throw new Error(`OpenAI API error`);
    const json = await response.json();
    return json.choices[0].message.content.trim();
  } catch (err) {
    console.warn(`[Improve AI] Error:`, err.message);
    return text;
  }
}
