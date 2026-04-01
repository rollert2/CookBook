// api/recipe.js
// Public recipe page — renders a full styled recipe for anyone with the link
// Route: /api/recipe?id=[recipe_id]

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rxedycriglsypezlpdrz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4ZWR5Y3JpZ2xzeXBlemxwZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTEwODIsImV4cCI6MjA5MDQ4NzA4Mn0.K1mqdJ8ciemSJ6Xn1rfOOakzbB7AcWOOmr9ra17WScg';

async function sb(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  return res.json();
}

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).send('Missing recipe id');

  // Check share is active
  const share = await sb(`recipe_shares?recipe_id=eq.${id}&active=eq.true&select=id`);
  if (!share || share.length === 0) {
    return res.status(404).send(renderNotFound());
  }

  // Get recipe + owner
  const recipes = await sb(`recipes?id=eq.${id}&select=*,users(username,avatar_url)`);
  if (!recipes || recipes.length === 0) return res.status(404).send(renderNotFound());
  const r = recipes[0];
  const owner = r.users || {};

  res.setHeader('Content-Type', 'text/html');
  res.send(renderRecipePage(r, owner));
}

function renderNotFound() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Recipe Not Found</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'DM Sans',sans-serif;background:#0d0d0f;color:#f0f0f0;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
  .icon{font-size:3em;margin-bottom:16px}.title{font-size:1.4em;font-weight:800;margin-bottom:8px}.sub{color:#666;font-size:0.9em;margin-bottom:24px}
  .btn{display:inline-block;padding:13px 24px;background:#c9a84c;color:#0d0d0f;border-radius:10px;font-weight:700;text-decoration:none;font-size:0.9em}</style>
  </head><body><div><div class="icon">🔒</div><div class="title">Recipe Not Available</div>
  <div class="sub">This recipe link has been disabled or doesn't exist.</div>
  <a href="https://rollcookbook.vercel.app" class="btn">Open Roll Cookbook</a></div></body></html>`;
}

function renderRecipePage(r, owner) {
  const ingredients = (r.ingredients || '').split('\n').filter(l => l.trim());
  const steps = (r.instructions || '').split('\n').filter(l => l.trim());
  const hasImg = r.image_url && r.image_url.trim();
  const avatarHtml = owner.avatar_url
    ? `<img src="${owner.avatar_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`
    : `<div style="width:32px;height:32px;border-radius:50%;background:rgba(201,168,76,0.2);border:1px solid #c9a84c;display:flex;align-items:center;justify-content:center;font-weight:800;color:#c9a84c;font-size:0.9em;">${(owner.username||'?').charAt(0).toUpperCase()}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
  <title>${escHtml(r.title)} — Roll Cookbook</title>
  <meta name="description" content="${escHtml((r.notes||'').slice(0,150))}">
  <meta property="og:title" content="${escHtml(r.title)}">
  <meta property="og:image" content="${hasImg ? escHtml(r.image_url) : ''}">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700;0,9..40,800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
    :root{--gold:#c9a84c;--bg:#0d0d0f;--surface:#18181c;--surface2:#222228;--glass:rgba(255,255,255,0.04);--border:rgba(255,255,255,0.08);--text:#f0f0f0;--dim:#888;--faint:#555;--green:#4caf7d;--radius:16px}
    body{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding-bottom:120px}
    .hero{width:100%;height:260px;background:var(--surface2);position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:5em;color:var(--gold);opacity:0.3}
    .hero img{width:100%;height:100%;object-fit:cover;opacity:1}
    .hero-overlay{position:absolute;bottom:0;left:0;right:0;padding:20px 18px 18px;background:linear-gradient(transparent,rgba(0,0,0,0.9))}
    .hero-cat{color:var(--gold);font-size:0.65em;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px}
    .hero-title{color:#fff;font-size:1.5em;font-weight:800;line-height:1.15;letter-spacing:-0.3px}
    .hero-meta{display:flex;gap:12px;margin-top:8px;flex-wrap:wrap}
    .hero-meta span{color:rgba(255,255,255,0.7);font-size:0.78em}
    .owner-bar{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border)}
    .owner-label{font-size:0.78em;color:var(--dim)}
    .owner-name{font-size:0.88em;font-weight:700}
    .section-title{font-size:0.65em;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--gold);padding:20px 18px 8px;border-bottom:1px solid var(--border);margin:0 18px}
    .section-body{padding:12px 18px 0}
    .ing-line{padding:8px 0;border-bottom:0.5px solid rgba(255,255,255,0.05);font-size:0.95em;display:flex;align-items:flex-start;gap:10px}
    .ing-dot{width:6px;height:6px;border-radius:50%;background:var(--gold);flex-shrink:0;margin-top:7px}
    .step{display:flex;gap:14px;margin-bottom:18px;align-items:flex-start}
    .step-num{width:28px;height:28px;flex-shrink:0;background:var(--glass);border:1px solid var(--border);border-radius:8px;font-size:0.72em;font-weight:700;display:flex;align-items:center;justify-content:center;color:var(--dim);margin-top:2px}
    .step-text{flex:1;line-height:1.6;font-size:0.95em}
    .notes-body{color:var(--dim);font-style:italic;font-size:0.9em;line-height:1.7;padding:12px 18px}
    .sticky-bar{position:fixed;bottom:0;left:0;right:0;padding:16px 18px 34px;background:var(--bg);border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px}
    .btn-add{padding:15px;background:var(--gold);color:var(--bg);border:none;border-radius:var(--radius);font-size:1em;font-weight:800;cursor:pointer;font-family:inherit;text-align:center;text-decoration:none;display:block;letter-spacing:-0.2px}
    .btn-app{padding:13px;background:var(--glass);border:1px solid var(--border);border-radius:var(--radius);font-size:0.88em;font-weight:600;cursor:pointer;font-family:inherit;text-align:center;text-decoration:none;display:block;color:var(--dim)}
    .toast{display:none;position:fixed;top:20px;left:16px;right:16px;background:#1a3d2b;border:1px solid var(--green);color:#4caf7d;padding:14px 16px;border-radius:12px;font-size:0.88em;font-weight:700;z-index:999;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.6)}
  </style>
</head>
<body>
  <div class="hero">${hasImg ? `<img src="${escHtml(r.image_url)}" alt="${escHtml(r.title)}">` : r.title.charAt(0)}
    <div class="hero-overlay">
      <div class="hero-cat">${escHtml(r.category||'General')}</div>
      <div class="hero-title">${escHtml(r.title)}</div>
      <div class="hero-meta">
        ${r.cook_time ? `<span>⏱ ${escHtml(r.cook_time)}</span>` : ''}
        ${r.servings ? `<span>👤 ${escHtml(r.servings)}</span>` : ''}
        ${r.rating ? `<span>★ ${r.rating}/10</span>` : ''}
      </div>
    </div>
  </div>
  <div class="owner-bar">
    ${avatarHtml}
    <div><div class="owner-label">Recipe by</div><div class="owner-name">${escHtml(owner.username||'Unknown')}</div></div>
    <div style="margin-left:auto;font-size:0.7em;color:var(--faint);">Roll Cookbook</div>
  </div>
  ${r.notes ? `<div class="notes-body">${escHtml(r.notes.slice(0,200))}${r.notes.length > 200 ? '...' : ''}</div>` : ''}
  <div class="section-title">Ingredients</div>
  <div class="section-body">${ingredients.map(i => `<div class="ing-line"><div class="ing-dot"></div>${escHtml(i)}</div>`).join('')}</div>
  <div class="section-title" style="margin-top:8px;">Instructions</div>
  <div class="section-body" style="padding-bottom:16px;">${steps.map((s,i) => `<div class="step"><div class="step-num">${i+1}</div><div class="step-text">${escHtml(s.replace(/^\d+\.\s*/,''))}</div></div>`).join('')}</div>
  <div id="toast" class="toast"></div>
  <div class="sticky-bar">
    <a id="addBtn" class="btn-add" href="#">✨ Add to my Cookbook</a>
    <a href="https://rollcookbook.vercel.app" class="btn-app">📱 Open Roll Cookbook App</a>
  </div>
  <script>
    const recipeId = '${r.id}';
    const appUrl = 'https://rollcookbook.vercel.app';
    document.getElementById('addBtn').addEventListener('click', e => {
      e.preventDefault();
      // Check if already in app via Median
      if (typeof median !== 'undefined') {
        window.location.href = appUrl + '?addRecipe=' + recipeId;
      } else {
        // Web — redirect to app with recipe param
        window.location.href = appUrl + '?addRecipe=' + recipeId;
      }
    });
  </script>
</body>
</html>`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
