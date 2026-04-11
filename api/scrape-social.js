// api/scrape-social.js
// Handles recipe extraction from social media URLs and share payloads
// Strategy per platform:
//   TikTok/Instagram: caption comes in via data.subject from the share payload (no scraping needed)
//   YouTube: parse ytInitialData from HTML to get video description
//   All: Gemini extracts recipe from whatever text we have

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ status: 'Error', message: 'Method not allowed' });

  const { url, subject, pastedText } = req.body;
  if (!url && !pastedText) return res.status(400).json({ status: 'Error', message: 'URL or text is required' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ status: 'Error', message: 'Gemini API key not configured' });

  const platform = detectPlatform(url || '');

  try {
    let recipeText = '';
    let videoTitle = cleanTitle(subject || '');
    let authorName = '';
    let thumbnailUrl = '';

    // ── Mode 1: Pasted text (most reliable, works for all platforms) ──
    if (pastedText && pastedText.trim().length > 10) {
      recipeText = pastedText.trim();
    }

    // ── Mode 2: Subject/caption from share payload ──
    // When a user shares from TikTok/Instagram app, the system passes the
    // video caption as `subject`. This often contains the full recipe.
    else if (subject && subject.length > 50 && looksLikeRecipe(subject)) {
      recipeText = subject;
      videoTitle = extractTitleFromCaption(subject) || videoTitle;
    }

    // ── Mode 3: Try to fetch the page (works best for YouTube, Pinterest) ──
    else if (url) {
      try {
        const html = await fetchPage(url, platform);
        if (html) {
          thumbnailUrl = extractThumbnail(html);
          authorName = extractAuthor(html, platform);

          if (platform === 'YouTube') {
            // YouTube: extract from ytInitialData JSON embedded in page
            const ytDesc = extractYouTubeDescription(html);
            const ytTitle = extractYouTubeTitle(html);
            if (ytTitle) videoTitle = ytTitle;
            if (ytDesc) recipeText = ytDesc;
            else recipeText = extractOgDescription(html) || extractBodyText(html);
          } else if (platform === 'Pinterest') {
            recipeText = extractOgDescription(html) || extractBodyText(html);
          } else {
            // TikTok/Instagram — their pages rarely have the caption in HTML
            // Try OG description first, then body text
            recipeText = extractOgDescription(html) || '';
            if (!recipeText || recipeText.length < 30) {
              recipeText = extractBodyText(html);
            }
          }
        }
      } catch(fetchErr) {
        // Platform blocked the fetch — fall through to subject-only mode
      }

      // Last resort: use whatever we got from subject even if it's short
      if (!recipeText && subject) {
        recipeText = subject;
      }
    }

    // Still nothing useful
    if (!recipeText || recipeText.trim().length < 15) {
      return res.json({
        status: 'Error',
        needsPaste: true,
        platform,
        message: `${platform} doesn't include recipe text in the share link. Please copy the video description and use the "Paste Description" option below.`
      });
    }

    // ── Gemini extraction ──
    const prompt = buildPrompt(recipeText, videoTitle, authorName, platform);

    // Try models in order — fall back on quota errors
    const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite-preview-06-17'];
    let rawText = '';
    let aiOk = false;
    for (const model of MODELS) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
            })
          }
        );
        const geminiData = await geminiRes.json();
        if (geminiData.error?.code === 429) continue;
        if (!geminiData.candidates?.[0]?.content?.parts?.[0]?.text) continue;
        rawText = geminiData.candidates[0].content.parts[0].text.trim()
          .replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        aiOk = true;
        break;
      } catch(e) { continue; }
    }
    if (!aiOk || !rawText) {
      return res.json({ status: 'Error', needsPaste: true, message: 'AI could not process this content. Try the Paste Description option.' });
    }

    let recipe;
    try { recipe = JSON.parse(rawText); }
    catch(e) {
      return res.json({ status: 'Error', needsPaste: true, message: 'Could not extract a recipe from this content. Try pasting the description manually.' });
    }

    // Fill blanks from metadata
    if (!recipe.title || recipe.title === 'Unknown') recipe.title = videoTitle || 'Imported Recipe';
    if (!recipe.image && thumbnailUrl) recipe.image_url = thumbnailUrl;
    recipe.source_url = url || '';

    const attribution = `Sourced from ${platform}${authorName ? ' (@' + authorName + ')' : ''}`;
    recipe.notes = recipe.notes
      ? recipe.notes + '\n\n— ' + attribution
      : '— ' + attribution;

    sanitizeRecipe(recipe);

    const isPartial = !recipe.ingredients || !recipe.instructions ||
      recipe.instructions.includes('See original video');

    return res.json({
      status: isPartial ? 'partial' : 'Success',
      message: `"${recipe.title}" imported from ${platform}!`,
      recipe,
      platform,
      author: authorName
    });

  } catch(e) {
    return res.json({ status: 'Error', message: 'Import failed: ' + (e.message || 'Unknown error') });
  }
}


// ── Sanitize Gemini output — flatten arrays, clean strings ───
function sanitizeRecipe(recipe) {
  if (!recipe) return recipe;
  // Gemini sometimes returns ingredients/instructions as JSON arrays instead of strings
  const flatten = (val) => {
    if (Array.isArray(val)) return val.join('\n');
    if (typeof val === 'string') return val.trim();
    return String(val || '');
  };
  recipe.ingredients   = flatten(recipe.ingredients);
  recipe.instructions  = flatten(recipe.instructions);
  recipe.notes         = flatten(recipe.notes);
  recipe.title         = flatten(recipe.title);
  recipe.cookTime      = flatten(recipe.cookTime);
  recipe.prepTime      = flatten(recipe.prepTime);
  recipe.servings      = flatten(recipe.servings);
  recipe.category      = flatten(recipe.category);
  return recipe;
}

// ── Platform detection ────────────────────────────────────────
function detectPlatform(url) {
  if (url.includes('tiktok.com'))     return 'TikTok';
  if (url.includes('instagram.com'))  return 'Instagram';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('pinterest.com'))  return 'Pinterest';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'X';
  if (url.includes('facebook.com'))   return 'Facebook';
  return 'Social Media';
}

// ── Does the text look like it has recipe content? ────────────
function looksLikeRecipe(text) {
  const lower = text.toLowerCase();
  const keywords = ['ingredient', 'tablespoon', 'teaspoon', 'cup', 'tbsp', 'tsp',
    'gram', 'oz', 'pound', 'minutes', 'preheat', 'mix', 'stir', 'cook', 'bake',
    'boil', 'fry', 'recipe', 'serves', 'makes', 'prep', 'step', 'instructions'];
  const matches = keywords.filter(k => lower.includes(k));
  return matches.length >= 2;
}

// ── Extract likely dish name from a social media caption ──────
function extractTitleFromCaption(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  // First non-hashtag, non-empty line is often the title
  for (const line of lines.slice(0, 3)) {
    if (!line.startsWith('#') && line.length > 3 && line.length < 80) {
      return cleanTitle(line);
    }
  }
  return '';
}

// ── Fetch page with appropriate headers ──────────────────────
async function fetchPage(url, platform) {
  const ua = platform === 'YouTube'
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';

  const r = await fetch(url, {
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!r.ok) return null;
  return r.text();
}

// ── YouTube-specific: extract description from ytInitialData ─
function extractYouTubeDescription(html) {
  try {
    // YouTube embeds all video data in a JS object
    const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s)
                || html.match(/ytInitialData\s*=\s*(\{.{500,}?\})\s*;/s);
    if (!match) return '';
    const data = JSON.parse(match[1]);
    // Navigate to video description
    const desc = findDeep(data, 'description');
    if (desc && typeof desc === 'object' && desc.runs) {
      return desc.runs.map(r => r.text || '').join('');
    }
    if (typeof desc === 'string') return desc;
  } catch(e) {}
  // Fallback: regex for description text
  const m = html.match(/"description":\{"runs":\[\{"text":"([\s\S]{20,1000}?)"\}/);
  return m ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '';
}

function extractYouTubeTitle(html) {
  const m = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"\}/)
           || html.match(/<title>([^<]+)<\/title>/);
  return m ? cleanTitle(m[1]) : '';
}

// ── Generic extractors ────────────────────────────────────────
function extractOgDescription(html) {
  const m = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]{10,})"/i)
           || html.match(/<meta[^>]*name="description"[^>]*content="([^"]{10,})"/i);
  return m ? decodeEntities(m[1]) : '';
}

function extractThumbnail(html) {
  const m = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
  return m ? m[1] : '';
}

function extractAuthor(html, platform) {
  const patterns = [
    /<meta[^>]*name="author"[^>]*content="([^"]+)"/i,
    /"author":\{"name":"([^"]+)"\}/i,
    /"creator":"([^"]+)"/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1] && m[1].length < 60) return m[1].replace(/^@/, '');
  }
  return '';
}

function extractBodyText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
}

function cleanTitle(t) {
  return (t || '')
    .replace(/\s*[-|@]\s*TikTok.*$/i, '')
    .replace(/\s*[-|]\s*Instagram.*$/i, '')
    .replace(/\s*[-|]\s*YouTube.*$/i, '')
    .replace(/\s*\|\s*Pinterest.*$/i, '')
    .replace(/#\w+/g, '').trim();
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function findDeep(obj, key, depth = 0) {
  if (depth > 8 || !obj || typeof obj !== 'object') return undefined;
  if (obj[key] !== undefined) return obj[key];
  for (const v of Object.values(obj)) {
    const found = findDeep(v, key, depth + 1);
    if (found !== undefined) return found;
  }
}

// ── Gemini prompt ─────────────────────────────────────────────
function buildPrompt(text, title, author, platform) {
  return `You are a recipe extraction assistant for a cooking app. The following content is from a ${platform} cooking video${author ? ' by @' + author : ''}.

${title ? 'VIDEO/POST TITLE: ' + title + '\n' : ''}CONTENT:
${text.slice(0, 8000)}

Extract the recipe. Social media recipes are often informal — quantities may be approximate, steps may be brief. Do your best with what's available.

Return ONLY a JSON object with these keys:
- "title": the dish name. Clean up hashtags and emojis from the title.
- "category": one of (Breakfast, Lunch, Dinner, Dessert, Snack, Drink, Sides, General)
- "ingredients": all ingredients one per line with quantities. Preserve section headers like "For the sauce:" if present.
- "instructions": numbered steps one per line. If no steps exist in the text, write "See original video for step-by-step instructions."
- "notes": tips, substitutions, storage info, creator notes, or hashtags as readable keywords. Empty string if none.
- "cookTime": e.g. "30 min" or empty string
- "prepTime": e.g. "10 min" or empty string
- "servings": e.g. "4 servings" or empty string

Return ONLY raw JSON. No markdown, no backticks, no preamble.`;
}
