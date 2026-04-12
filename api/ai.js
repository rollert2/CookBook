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

  const { prompt, maxTokens, image } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
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
