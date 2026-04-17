// api/ai.js
// General-purpose AI prompt endpoint using Gemini
// Supports optional image input (base64) for photo scan feature

// Increase body size limit for base64 image uploads (default 1MB is too small)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  // CORS Restrictions
  const allowedOrigins = ['https://rollcookbook.com', 'https://www.rollcookbook.com', 'http://localhost:3000', 'capacitor://localhost', 'http://localhost'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // If no origin or not in allowed list, default to rollcookbook.com for safety
    res.setHeader('Access-Control-Allow-Origin', 'https://rollcookbook.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Simple IP-based rate limiting using an in-memory Map (Note: This resets on serverless cold starts, but provides basic protection)
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (!global.rateLimitMap) global.rateLimitMap = new Map();
  
  // Clean up old entries
  for (const [key, timestamp] of global.rateLimitMap.entries()) {
    if (now - timestamp > 60000) { // 1 minute window
      global.rateLimitMap.delete(key);
    }
  }

  // Count requests from this IP in the last minute
  let requestCount = 0;
  for (const [key, timestamp] of global.rateLimitMap.entries()) {
    if (key.startsWith(ip) && now - timestamp < 60000) {
      requestCount++;
    }
  }

  if (requestCount >= 10) { // Max 10 requests per minute per IP
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  // Record this request
  global.rateLimitMap.set(`${ip}-${now}`, now);

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'Gemini API key not configured' });

  // Handle "What's In My Fridge?" action
  if (req.body.action === 'fridge_recipes') {
    const { ingredients, username } = req.body;
    if (!ingredients) return res.status(400).json({ status: 'Error', message: 'Ingredients are required' });

    const prompt = `You must return ONLY a JSON array. No text before or after. No markdown formatting. No code blocks.

A user has these ingredients available: ${ingredients}

Generate 3-5 complete recipe suggestions that primarily use these ingredients. For each recipe, provide:
- title: Creative recipe name
- category: One of (Breakfast, Lunch, Dinner, Sides, Snack, Drink, Dessert, General)
- ingredients: Complete ingredient list with measurements (one per line)
- instructions: Step-by-step cooking instructions (one step per line)
- cook_time: Estimated cooking time
- prep_time: Estimated prep time
- servings: Number of servings
- match_reason: Brief explanation of how it uses their ingredients (1 sentence)

Return ONLY the JSON array, nothing else.`;

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 2000,
              temperature: 0.3
            }
          }),
          signal: AbortSignal.timeout(30000)
        }
      );

      const data = await geminiRes.json();
      if (!geminiRes.ok) {
        return res.status(500).json({ status: 'Error', message: 'AI request failed: ' + (data?.error?.message || 'Unknown error') });
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      // Parse the JSON response - be very robust about handling markdown/formatting
      try {
        // Strip markdown code blocks, backticks, and any leading/trailing text
        let cleanText = text;
        // Remove ```json or ``` blocks (case insensitive)
        cleanText = cleanText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
        // Find the first [ and last ] to extract just the JSON array
        const firstBracket = cleanText.indexOf('[');
        const lastBracket = cleanText.lastIndexOf(']');
        if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
          console.error('No JSON array found. Raw response:', text.substring(0, 200));
          return res.status(500).json({ status: 'Error', message: 'AI returned invalid format. Try simpler ingredients like "chicken rice vegetables".' });
        }
        cleanText = cleanText.substring(firstBracket, lastBracket + 1).trim();
        const recipes = JSON.parse(cleanText);
        if (!Array.isArray(recipes) || recipes.length === 0) {
          console.error('Not an array. Parsed:', typeof recipes, 'Raw:', text.substring(0, 200));
          return res.status(500).json({ status: 'Error', message: 'AI returned invalid format. Try simpler ingredients like "chicken rice vegetables".' });
        }
        return res.json({ status: 'Success', recipes });
      } catch(e) {
        console.error('Parse error:', e.message, 'Raw text first 200:', text.substring(0, 200));
        return res.status(500).json({ status: 'Error', message: 'AI returned invalid format. Try simpler ingredients like "chicken rice vegetables".' });
      }
    } catch(e) {
      return res.status(500).json({ status: 'Error', message: e.message });
    }
  }

  // Handle "Auto-Leftover Recipes" action
  if (req.body.action === 'leftover_recipes') {
    const { ingredients, original_recipe, username } = req.body;
    if (!ingredients) return res.status(400).json({ status: 'Error', message: 'Ingredients are required' });

    const prompt = `You must return ONLY a JSON array. No text before or after. No markdown formatting. No code blocks.

A user just finished cooking "${original_recipe}" and likely has leftover ingredients, partial items, or base components remaining.

Based on these ingredients they used: ${ingredients}

Suggest 2-4 different recipes they could make with what's likely left over or complementary items they might have. For each recipe, provide:
- title: Creative recipe name
- category: One of (Breakfast, Lunch, Dinner, Sides, Snack, Drink, Dessert, General)
- ingredients: Complete ingredient list with measurements (one per line)
- instructions: Step-by-step cooking instructions (one step per line)
- cook_time: Estimated cooking time
- prep_time: Estimated prep time
- servings: Number of servings
- match_reason: Brief explanation of how it uses leftovers from the original recipe (1 sentence)

Return ONLY the JSON array, nothing else.`;

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 1500,
              temperature: 0.4
            }
          }),
          signal: AbortSignal.timeout(30000)
        }
      );

      const data = await geminiRes.json();
      if (!geminiRes.ok) {
        return res.status(500).json({ status: 'Error', message: 'AI request failed: ' + (data?.error?.message || 'Unknown error') });
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      try {
        let cleanText = text;
        cleanText = cleanText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
        const firstBracket = cleanText.indexOf('[');
        const lastBracket = cleanText.lastIndexOf(']');
        if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
          console.error('No JSON array found. Raw:', text.substring(0, 200));
          return res.status(500).json({ status: 'Error', message: 'Invalid format from AI. Try again.' });
        }
        cleanText = cleanText.substring(firstBracket, lastBracket + 1).trim();
        const recipes = JSON.parse(cleanText);
        if (!Array.isArray(recipes) || recipes.length === 0) {
          console.error('Not an array. Raw:', text.substring(0, 200));
          return res.status(500).json({ status: 'Error', message: 'Invalid format from AI. Try again.' });
        }
        return res.json({ status: 'Success', recipes });
      } catch(e) {
        console.error('Parse error:', e.message, 'Raw:', text.substring(0, 200));
        return res.status(500).json({ status: 'Error', message: 'Invalid format from AI. Try again.' });
      }
    } catch(e) {
      return res.status(500).json({ status: 'Error', message: e.message });
    }
  }

  const { prompt, maxTokens, image } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'Gemini API key not configured' });

  const models = ['gemini-2.5-flash'];

  // Build parts — text only, or image + text for photo scan
  const parts = [];
  if (image && image.base64 && image.mimeType) {
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
  }
  parts.push({ text: prompt });

  let lastError = '';
  for (const model of models) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              maxOutputTokens: maxTokens || 1500,
              temperature: 0.2
            }
          }),
          signal: AbortSignal.timeout(30000)
        }
      );

      const data = await geminiRes.json();

      if (!geminiRes.ok) {
        lastError = data?.error?.message || geminiRes.statusText;
        if (geminiRes.status === 429) continue;
        return res.status(500).json({ error: `Gemini error: ${lastError}` });
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return res.json({ status: 'Success', text, model });
    } catch(e) {
      lastError = e.message;
      continue;
    }
  }

  return res.status(500).json({ error: `AI request failed: ${lastError}` });
}
