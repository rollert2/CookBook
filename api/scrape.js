// api/scrape.js
// Vercel serverless function — scrapes a recipe URL using Gemini AI
// Replaces the Apps Script scrapeRecipeWithAI function

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'Error', message: 'Method not allowed' });
  }

  const { url } = req.body;
  if (!url) return res.status(400).json({ status: 'Error', message: 'URL is required' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ status: 'Error', message: 'Gemini API key not configured' });

  try {
    // Fetch the page
    const pageRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!pageRes.ok) {
      return res.json({ status: 'Error', message: 'Could not fetch that page. It may block scrapers.' });
    }

    const html = await pageRes.text();

    // Try JSON-LD first (fastest, most reliable)
    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const block of jsonLdMatch) {
        try {
          const json = JSON.parse(block.replace(/<script[^>]*>|<\/script>/gi, '').trim());
          const schemas = Array.isArray(json) ? json : [json, ...(json['@graph'] || [])];
          for (const schema of schemas) {
            if (schema['@type'] === 'Recipe') {
              const recipe = parseJsonLdRecipe(schema);
              if (recipe) return res.json({ status: 'Success', message: `"${recipe.title}" added to your cookbook!`, recipe });
            }
          }
        } catch(e) {}
      }
    }

    // Fall back to Gemini AI extraction
    const cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    const prompt = `You are a recipe extraction assistant. Extract the recipe from the text below and return ONLY a valid JSON object with these exact keys:
- "title": recipe name
- "category": one of (Breakfast, Lunch, Dinner, Dessert, Snack, Drink, Sides, General)
- "ingredients": ingredients as plain text. If the recipe has multiple ingredient sections (e.g. "For the Marinade", "For Cooking"), preserve each section header on its own line followed by the ingredients for that section. Each ingredient on its own line.
- "instructions": numbered steps, each on its own line
- "notes": extract ALL recipe notes, tips, variations, substitutions, and make-ahead instructions. Include numbered or labeled notes exactly as written (e.g. "Note 1:", "Note 2:"). If steps reference notes, include the full note content here. Empty string if none.
- "cookTime": total time e.g. "35 min" (empty string if not found)
- "prepTime": prep time e.g. "15 min" (empty string if not found)
- "servings": serving size e.g. "4 servings" or "Makes 12 cookies" (empty string if not found)

Return ONLY raw JSON. No markdown, no backticks, no explanation.

PAGE TEXT:
\${cleanText}\`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
        })
      }
    );

    const geminiData = await geminiRes.json();
    if (!geminiData.candidates?.[0]) {
      return res.json({ status: 'Error', message: 'AI could not extract a recipe from this page.' });
    }

    let recipeText = geminiData.candidates[0].content.parts[0].text.trim()
      .replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

    let recipe;
    try { recipe = JSON.parse(recipeText); }
    catch(e) { return res.json({ status: 'Error', message: 'AI could not parse the recipe data from this page.' }); }

    if (!recipe.title || !recipe.ingredients || !recipe.instructions) {
      return res.json({ status: 'Error', message: 'AI extracted incomplete data. Try a different URL.' });
    }

    // Always attach source URL so we can link back to original
    recipe.source_url = url;

    return res.json({ status: 'Success', message: `"${recipe.title}" imported!`, recipe });

  } catch(e) {
    return res.json({ status: 'Error', message: 'Failed to fetch page. The site may use JavaScript rendering that blocks scraping.' });
  }
}

function parseJsonLdRecipe(schema) {
  try {
    const title = schema.name;
    if (!title) return null;

    const ingredients = Array.isArray(schema.recipeIngredient)
      ? schema.recipeIngredient.join('\n')
      : '';

    const instructions = Array.isArray(schema.recipeInstructions)
      ? schema.recipeInstructions.map((step, i) => {
          const text = typeof step === 'string' ? step : step.text || '';
          return `${i+1}. ${text}`;
        }).join('\n')
      : typeof schema.recipeInstructions === 'string'
        ? schema.recipeInstructions
        : '';

    if (!ingredients || !instructions) return null;

    // Parse cook time from ISO 8601 duration e.g. PT1H30M
    let cookTime = '';
    const totalTime = schema.totalTime || schema.cookTime;
    if (totalTime) {
      const match = totalTime.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
      if (match) {
        const hours = parseInt(match[1] || 0);
        const mins = parseInt(match[2] || 0);
        cookTime = hours > 0 ? `${hours} hr ${mins > 0 ? mins + ' min' : ''}`.trim() : `${mins} min`;
      }
    }

    return {
      title,
      category: 'General',
      ingredients,
      instructions,
      notes: schema.description || '',
      cookTime,
      image: typeof schema.image === 'string' ? schema.image
           : Array.isArray(schema.image) ? schema.image[0]
           : schema.image?.url || ''
    };
  } catch(e) { return null; }
}
