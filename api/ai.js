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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'Gemini API key not configured' });

  // Handle "What's In My Fridge?" action
  if (req.body.action === 'fridge_recipes') {
    const { ingredients, username } = req.body;
    if (!ingredients) return res.status(400).json({ status: 'Error', message: 'Ingredients are required' });

    const prompt = `A user has these ingredients available: ${ingredients}

Generate 3-5 complete recipe suggestions that primarily use these ingredients. For each recipe, provide:
- title: Creative recipe name
- category: One of (Breakfast, Lunch, Dinner, Sides, Snack, Drink, Dessert, General)
- ingredients: Complete ingredient list with measurements (one per line)
- instructions: Step-by-step cooking instructions (one step per line)
- cook_time: Estimated cooking time
- prep_time: Estimated prep time
- servings: Number of servings
- match_reason: Brief explanation of how it uses their ingredients (1 sentence)

Format as a JSON array. Return ONLY the JSON array, no markdown formatting.`;

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
      // Parse the JSON response
      try {
        // Strip markdown code blocks if present
        const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const recipes = JSON.parse(cleanText);
        return res.json({ status: 'Success', recipes });
      } catch(e) {
        return res.status(500).json({ status: 'Error', message: 'Failed to parse AI response. Please try again.' });
      }
    } catch(e) {
      return res.status(500).json({ status: 'Error', message: e.message });
    }
  }

  // Handle "Auto-Leftover Recipes" action
  if (req.body.action === 'leftover_recipes') {
    const { ingredients, original_recipe, username } = req.body;
    if (!ingredients) return res.status(400).json({ status: 'Error', message: 'Ingredients are required' });

    const prompt = `A user just finished cooking "${original_recipe}" and likely has leftover ingredients, partial items, or base components remaining.

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

Format as a JSON array. Return ONLY the JSON array, no markdown formatting.`;

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
        const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const recipes = JSON.parse(cleanText);
        return res.json({ status: 'Success', recipes });
      } catch(e) {
        return res.status(500).json({ status: 'Error', message: 'Failed to parse AI response. Please try again.' });
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
