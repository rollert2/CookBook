// api/auth.js
// Handles Supabase Auth operations server-side
// Keeps client secret out of the frontend

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = 'https://rxedycriglsypezlpdrz.supabase.co';
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4ZWR5Y3JpZ2xzeXBlemxwZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTEwODIsImV4cCI6MjA5MDQ4NzA4Mn0.K1mqdJ8ciemSJ6Xn1rfOOakzbB7AcWOOmr9ra17WScg';

  const { action, email, password, username, access_token } = req.body || {};

  try {
    // ── Sign up with email + password ──
    if (action === 'signup') {
      if (!email || !password || !username) {
        return res.status(400).json({ error: 'email, password, and username required' });
      }
      const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({
          email,
          password,
          data: { username },
          options: {
            emailRedirectTo: 'https://rollcookbook.vercel.app/'
          }
        })
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data.msg || data.error_description || 'Signup failed' });
      return res.status(200).json({ user: data.user, session: data.session });
    }

    // ── Sign in with email + password ──
    if (action === 'signin') {
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password required' });
      }
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password })
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data.error_description || 'Invalid credentials' });
      return res.status(200).json({ session: data, user: data.user });
    }

    // ── Password reset email ──
    if (action === 'reset') {
      if (!email) return res.status(400).json({ error: 'email required' });
      const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({
          email,
          redirect_to: 'https://rollcookbook.vercel.app/'
        })
      });
      const data = await r.json().catch(() => ({}));
      return res.status(200).json({ ok: r.ok, data });
    }

    // ── Get user from access token ──
    if (action === 'getuser') {
      if (!access_token) return res.status(400).json({ error: 'access_token required' });
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'Authorization': `Bearer ${access_token}`, 'apikey': SUPABASE_ANON_KEY }
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: 'Invalid token' });
      return res.status(200).json({ user: data });
    }

    // ── Get Google OAuth URL ──
    if (action === 'google_url') {
      const redirectTo = encodeURIComponent('https://rollcookbook.vercel.app/');
      const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${redirectTo}`;
      return res.status(200).json({ url });
    }

    // ── Change password (requires current session token) ──
    if (action === 'change_password') {
      const { new_password, access_token: token } = req.body;
      if (!new_password || !token) return res.status(400).json({ error: 'new_password and access_token required' });
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ password: new_password })
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data.msg || data.error_description || 'Could not change password' });
      return res.status(200).json({ ok: true });
    }

    // ── Change email (requires current session token) ──
    if (action === 'change_email') {
      const { new_email, access_token: token } = req.body;
      if (!new_email || !token) return res.status(400).json({ error: 'new_email and access_token required' });
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email: new_email, data: {} })
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data.msg || data.error_description || 'Could not change email' });
      return res.status(200).json({ ok: true });
    }

    // ── Delete auth user (admin only) ──
    if (action === 'delete_user') {
      const { auth_id } = req.body;
      if (!auth_id) return res.status(400).json({ error: 'auth_id required' });
      // Use service role key for admin operations
      const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${auth_id}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      return res.status(200).json({ ok: r.ok });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (e) {
    console.error('auth.js error:', e);
    return res.status(500).json({ error: e.message });
  }
}
