// ============================================================
// ROLL COOKBOOK — sb-core.js
// Base fetch utility and shared constants
// ============================================================

const SUPABASE_URL = 'https://rxedycriglsypezlpdrz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4ZWR5Y3JpZ2xzeXBlemxwZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTEwODIsImV4cCI6MjA5MDQ4NzA4Mn0.K1mqdJ8ciemSJ6Xn1rfOOakzbB7AcWOOmr9ra17WScg';

async function sbFetch(method, table, body = null, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  };
  if (method === 'POST') headers['Prefer'] = 'return=representation';
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Supabase error');
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Expose for admin panel direct queries
window._sbFetch = sbFetch;
