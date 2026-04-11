// api/scrape-social.js
// Vercel serverless function — extracts recipes from social media video descriptions
// Handles TikTok, Instagram Reels, YouTube Shorts, Pinterest, Twitter/X
// Called when user shares a social media URL into Roll Cookbook via the Share Into App feature

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ status: 'Error', message: 'Method not allowed' });

  const { url, subject } = req.body;
  if (!url) return res.status(400).json({ status: 'Error', message: 'URL is required' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ status: 'Error', message: 'Gemini API key not configured' });

  const domain = getDomain(url);
  const platform = detectPlatform(url);

  try {
    // Attempt to fetch the page with social-media-friendly headers
    let pageText = '';
    let videoTitle = subject || '';
    let authorName = '';
    let thumbnailUrl = '';

    try {
      const headers = getSocialHeaders(platform);
      const pageRes = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });

      if (pageRes.ok) {
        const html = await pageRes.text();

        // Extract metadata
        videoTitle = videoTitle || extractMetaTitle(html) || '';
        authorName = extractAuthorName(html, platform);
        thumbnailUrl = extractThumbnail(html);

        // Try Open Graph / JSON-LD description first
        const ogDesc = extractOgDescription(html);
        const jsonLdDesc = extractJsonLdDescription(html);

        pageText = [ogDesc, jsonLdDesc, extractBodyText(html)].filter(Boolean).join('\n\n').slice(0, 10000);
      }
    } catch(fetchErr) {
      // Fetch failed (TikTok often blocks) — use subject/title only as fallback
      pageText = subject || '';
    }

    if (!pageText && !videoTitle) {
      return res.json({
        status: 'Error',
        message: `${platform} blocked the page fetch. Try pasting the video description manually using the text import option.`
      });
    }

    // Build a social-media-aware Gemini prompt
    const prompt = buildSocialPrompt(pageText, videoTitle, authorName, platform);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
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
    if (!geminiData.candidates?.[0]) {
      return res.json({ status: 'Error', message: 'AI could not extract a recipe from this content.' });
    }

    let recipeText = geminiData.candidates[0].content.parts[0].text.trim()
      .replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

    let recipe;
    try { recipe = JSON.parse(recipeText); }
    catch(e) {
      return res.json({ status: 'Error', message: 'Could not parse recipe data. The video description may not contain a full recipe.' });
    }

    // Validate we got something useful
    if (!recipe.title && !videoTitle) {
      return res.json({ status: 'Error', message: 'No recipe found in this content. The video description may not include ingredients or instructions.' });
    }

    // Fill in missing fields from metadata
    if (!recipe.title || recipe.title === 'Unknown') recipe.title = cleanTitle(videoTitle);
    if (!recipe.image && thumbnailUrl) recipe.image_url = thumbnailUrl;
    if (!recipe.source_url) recipe.source_url = url;

    // Add platform attribution to notes
    const attribution = authorName
      ? `Sourced from ${platform}${authorName ? ' (@' + authorName + ')' : ''}`
      : `Sourced from ${platform}`;
    if (recipe.notes) {
      recipe.notes = recipe.notes + '\n\n— ' + attribution;
    } else {
      recipe.notes = '— ' + attribution;
    }

    if (!recipe.ingredients || !recipe.instructions) {
      return res.json({
        status: 'partial',
        message: 'Partial recipe found — you may need to fill in some details.',
        recipe
      });
    }

    return res.json({
      status: 'Success',
      message: `"${recipe.title}" imported from ${platform}!`,
      recipe,
      platform,
      author: authorName
    });

  } catch(e) {
    return res.json({
      status: 'Error',
      message: 'Failed to import from ' + platform + '. ' + (e.message || '')
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch(e) { return ''; }
}

function detectPlatform(url) {
  if (url.includes('tiktok.com'))     return 'TikTok';
  if (url.includes('instagram.com'))  return 'Instagram';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('pinterest.com'))  return 'Pinterest';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'X (Twitter)';
  if (url.includes('facebook.com'))   return 'Facebook';
  if (url.includes('snapchat.com'))   return 'Snapchat';
  return 'Social Media';
}

function getSocialHeaders(platform) {
  // Use different user agents for different platforms
  const base = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
  };

  if (platform === 'TikTok') {
    // TikTok responds better to mobile user agents
    return { ...base, 'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' };
  }
  if (platform === 'Instagram') {
    return { ...base, 'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' };
  }
  return { ...base, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' };
}

function extractMetaTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
             || html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)
             || html.match(/<meta[^>]*name="title"[^>]*content="([^"]+)"/i);
  return m ? m[1].trim() : '';
}

function extractOgDescription(html) {
  const m = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)
             || html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
  return m ? decodeHtmlEntities(m[1].trim()) : '';
}

function extractJsonLdDescription(html) {
  const matches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of matches) {
    try {
      const json = JSON.parse(block.replace(/<script[^>]*>|<\/script>/gi, '').trim());
      const objs = Array.isArray(json) ? json : [json, ...(json['@graph'] || [])];
      for (const obj of objs) {
        if (obj.description) return obj.description;
        if (obj.articleBody) return obj.articleBody;
      }
    } catch(e) {}
  }
  return '';
}

function extractAuthorName(html, platform) {
  // Try various author meta patterns
  const patterns = [
    /<meta[^>]*name="author"[^>]*content="([^"]+)"/i,
    /<meta[^>]*property="article:author"[^>]*content="([^"]+)"/i,
    /"author"\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"/i,
    /"creator"\s*:\s*"([^"]+)"/i,
    /@([a-zA-Z0-9_.]+)/  // fallback: first @mention
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1] && m[1].length < 50) return m[1].replace('@', '');
  }
  return '';
}

function extractThumbnail(html) {
  const m = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)
             || html.match(/<meta[^>]*name="twitter:image"[^>]*content="([^"]+)"/i);
  return m ? m[1].trim() : '';
}

function extractBodyText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

function cleanTitle(title) {
  // Remove common social media title suffixes
  return title
    .replace(/\s*[-|@]\s*TikTok.*$/i, '')
    .replace(/\s*[-|]\s*Instagram.*$/i, '')
    .replace(/\s*[-|]\s*YouTube.*$/i, '')
    .replace(/\s*\|\s*Pinterest.*$/i, '')
    .replace(/@\w+\s*[-|•]\s*/g, '')
    .trim();
}

function buildSocialPrompt(pageText, videoTitle, authorName, platform) {
  const context = [
    videoTitle ? `VIDEO TITLE: ${videoTitle}` : '',
    authorName ? `CREATOR: @${authorName}` : '',
    `PLATFORM: ${platform}`,
    pageText ? `\nCONTENT:\n${pageText}` : ''
  ].filter(Boolean).join('\n');

  return `You are a recipe extraction assistant specializing in social media cooking content.

The following content is from a ${platform} cooking video. The description may contain a full recipe, partial recipe, or just ingredients/steps listed informally. Extract whatever recipe information is available.

${context}

Return ONLY a valid JSON object with these exact keys (use empty string if not found):
- "title": the dish name. Use the video title if available, clean up hashtags/emojis
- "category": one of (Breakfast, Lunch, Dinner, Dessert, Snack, Drink, Sides, General)
- "ingredients": all ingredients, one per line. Preserve section headers if present (e.g. "For the sauce:"). Include quantities. If informal (e.g. "a bit of salt") keep as-is.
- "instructions": cooking steps, numbered, one per line. If steps are in the description or comments, extract them. If only ingredients are listed and no steps, write "See original video for instructions."
- "notes": any tips, substitutions, storage info, hashtags converted to readable tags, or creator notes. Include the @creator handle if known.
- "cookTime": e.g. "30 min" or empty string
- "prepTime": e.g. "10 min" or empty string  
- "servings": e.g. "4 servings" or empty string

Important: Social media recipes are often informal. Do your best even with incomplete data. Never return null for title — use the video title or dish name from hashtags.

Return ONLY raw JSON. No markdown, no backticks, no explanation.`;
}
