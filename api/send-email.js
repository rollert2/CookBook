// api/send-email.js
// Sends emails via Resend REST API (no SDK needed)
// Set RESEND_API_KEY in Vercel environment variables

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, email, username } = req.body || {};

  if (!email || !username) {
    return res.status(400).json({ error: 'Missing email or username' });
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    // Debug: list available env var names (not values)
    const envKeys = Object.keys(process.env).filter(k => k.includes('RESEND') || k.includes('SEND') || k.includes('KEY'));
    console.error('RESEND_API_KEY not set. Similar env vars found:', envKeys);
    return res.status(500).json({ error: 'Email not configured', debug: 'RESEND_API_KEY missing', envHints: envKeys });
  }

  try {
    // ── Welcome email ──
    if (type === 'welcome') {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_KEY}`
        },
        body: JSON.stringify({
          from: 'Roll Cookbook <welcome@rollcookbook.com>',
          to: [email],
          subject: 'Welcome to Roll Cookbook! 🍳',
          html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="color-scheme" content="light"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:0;background:#f5f5f5;">
  <div style="background:#ffffff;border-radius:12px;overflow:hidden;margin:20px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:#c9a84c;padding:28px 24px;text-align:center;">
      <div style="font-size:42px;margin-bottom:6px;">🍳</div>
      <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:800;">Welcome to Roll Cookbook!</h1>
    </div>
    <div style="padding:24px;">
      <p style="font-size:16px;color:#333333;margin:0 0 8px;">Hey <strong>${username}</strong> — thanks for joining!</p>
      <p style="font-size:14px;color:#555555;line-height:1.6;margin:0 0 20px;">Roll Cookbook is your personal recipe companion. Here is what you get for free:</p>
      <ul style="font-size:14px;color:#444444;line-height:2;padding-left:20px;margin:0 0 20px;">
        <li>📸 Import recipes from any URL</li>
        <li>🍳 Cook mode with step-by-step timers</li>
        <li>🌍 Community — share and discover recipes</li>
        <li>🔖 Save favourites, rate, and organize with tags</li>
        <li>📱 Recipe scaling, unit conversion & QR codes</li>
      </ul>
      <div style="background:#faf3e0;border-left:4px solid #c9a84c;border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 20px;">
        <p style="font-size:14px;color:#8b6914;font-weight:700;margin:0 0 6px;">⭐ Go Pro to unlock:</p>
        <ul style="font-size:13px;color:#8b6914;line-height:1.8;padding-left:18px;margin:0;">
          <li>📅 Meal planner with templates & week view</li>
          <li>🥫 Pantry tracker — find recipes from what you have</li>
          <li>🛒 Smart shopping lists with aisle grouping</li>
          <li>📷 AI-powered photo scan</li>
          <li>📊 Nutrition estimates & logging</li>
          <li>🔄 Ingredient substitution & leftover suggestions</li>
          <li>🚫 Ad-free experience</li>
        </ul>
      </div>
      <p style="font-size:14px;color:#555555;line-height:1.6;margin:0 0 16px;">You are all set. Open the app and start cooking!</p>
    </div>
  </div>
  <p style="font-size:12px;color:#999999;text-align:center;margin:0 20px 24px;line-height:1.5;">If you didn't create this account, please let us know at <a href="mailto:rollcookbook@hxosixo.resend.app" style="color:#999999;">rollcookbook@hxosixo.resend.app</a></p>
</body>
</html>`
        })
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error('Resend error:', r.status, JSON.stringify(data));
        return res.status(500).json({ error: 'Failed to send email', resendStatus: r.status, resendError: data });
      }

      return res.status(200).json({ success: true, id: data.id });
    }

    return res.status(400).json({ error: 'Unknown email type' });

  } catch (e) {
    console.error('send-email.js error:', e);
    return res.status(500).json({ error: e.message });
  }
}
