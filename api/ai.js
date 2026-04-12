// api/ai.js
// General-purpose AI prompt endpoint using Gemini 1.5 Flash
// Used for: macros estimation, ingredient substitutions

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, maxTokens } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'Gemini API key not configured' });

  // Try models in order of preference — fall back if one is quota-limited
  const models = [
    'gemini-2.5-flash',
  ];

  let lastError = '';
  for (const model of models) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: maxTokens || 500,
              temperature: 0.3
            }
          }),
          signal: AbortSignal.timeout(15000)
        }
      );

      const data = await geminiRes.json();

      // If rate limited, try next model
      if (!geminiRes.ok) {
        const msg = data?.error?.message || geminiRes.statusText;
        if (geminiRes.status === 429) {
          lastError = `${model} quota exceeded`;
          continue; // try next model
        }
        return res.status(500).json({ error: `${model} error: ${msg}` });
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return res.json({ status: 'Success', text, model });
    } catch (e) {
      lastError = e.message;
      continue;
    }
  }

  // All models failed
  return res.status(429).json({ error: `All models quota exceeded. Last error: ${lastError}. Add billing to your Google AI account at aistudio.google.com.` });
}
