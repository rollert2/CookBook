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
    console.error('RESEND_API_KEY not set');
    return res.status(500).json({ error: 'Email not configured' });
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
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:20px;background:#1a1a1a;color:#e0e0e0;">
  <div style="text-align:center;padding:30px 0;">
    <div style="font-size:48px;margin-bottom:12px;">🍳</div>
    <h1 style="color:#c9a84c;margin:0 0 8px;font-size:24px;">Welcome to Roll Cookbook!</h1>
    <p style="font-size:16px;color:#a0a0a0;margin:0;">Hey <strong style="color:#e0e0e0;">${username}</strong> — thanks for joining!</p>
  </div>
  <div style="background:#252525;border-radius:12px;padding:20px;margin:16px 0;">
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">Roll Cookbook is your personal recipe companion. Here is what you can do:</p>
    <ul style="font-size:14px;line-height:1.8;padding-left:20px;margin:0;">
      <li>📸 <strong>Scan recipes</strong> from photos or import from any URL</li>
      <li>🍳 <strong>Cook mode</strong> with step-by-step timers</li>
      <li>📅 <strong>Meal planner</strong> to organize your week</li>
      <li>🛒 <strong>Shopping lists</strong> with smart aisle grouping</li>
      <li>🥫 <strong>Pantry tracker</strong> — find recipes from what you have</li>
      <li>🌍 <strong>Community</strong> — share and discover recipes</li>
    </ul>
  </div>
  <p style="font-size:14px;color:#a0a0a0;text-align:center;">You are all set. Open the app and start cooking!</p>
  <div style="text-align:center;margin-top:24px;">
    <a href="https://rollcookbook.com" style="display:inline-block;padding:12px 28px;background:#c9a84c;color:#1a1a1a;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Open Roll Cookbook</a>
  </div>
  <p style="font-size:11px;color:#666;text-align:center;margin-top:30px;">If you did not create this account, you can ignore this email.</p>
</body>
</html>`
        })
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error('Resend error:', data);
        return res.status(500).json({ error: 'Failed to send email' });
      }

      return res.status(200).json({ success: true, id: data.id });
    }

    return res.status(400).json({ error: 'Unknown email type' });

  } catch (e) {
    console.error('send-email.js error:', e);
    return res.status(500).json({ error: e.message });
  }
}
