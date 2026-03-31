// api/search.js
// Vercel serverless function — searches for recipes via SerpAPI
// Replaces the Apps Script searchRecipes function

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'Error', message: 'Method not allowed' });
  }

  const { query } = req.body;
  if (!query) return res.status(400).json({ status: 'Error', message: 'Query is required' });

  const SERPAPI_KEY = process.env.SERPAPI_KEY;
  if (!SERPAPI_KEY) return res.status(500).json({ status: 'Error', message: 'SerpAPI key not configured' });

  try {
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query + ' recipe')}&num=15&api_key=${SERPAPI_KEY}`;
    const serpRes = await fetch(url);

    if (!serpRes.ok) {
      return res.json({ status: 'Error', message: `Search error (${serpRes.status})` });
    }

    const data = await serpRes.json();

    if (!data.organic_results || data.organic_results.length === 0) {
      return res.json({ status: 'Success', results: [] });
    }

    const results = data.organic_results.map(item => ({
      title:     item.title || '',
      url:       item.link || '',
      site:      item.displayed_link || '',
      snippet:   item.snippet || '',
      thumbnail: item.thumbnail || ''
    }));

    return res.json({ status: 'Success', results });

  } catch(e) {
    return res.json({ status: 'Error', message: e.message });
  }
}
