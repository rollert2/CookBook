// ============================================================
// ROLL COOKBOOK — Supabase Client
// ============================================================

const SUPABASE_URL = 'https://rxedycriglsypezlpdrz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4ZWR5Y3JpZ2xzeXBlemxwZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTEwODIsImV4cCI6MjA5MDQ4NzA4Mn0.K1mqdJ8ciemSJ6Xn1rfOOakzbB7AcWOOmr9ra17WScg';

// ── BASE FETCH ───────────────────────────────────────────────
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
    const err = await res.json();
    throw new Error(err.message || 'Supabase error');
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── USER FUNCTIONS ───────────────────────────────────────────

// Check if username exists
async function checkUsername(username) {
  const data = await sbFetch('GET', 'users', null,
    `username=eq.${username.toLowerCase()}&select=id,username`);
  return { status: 'Success', exists: data.length > 0, username: username.toLowerCase() };
}

// Create a new user
async function createUser(username) {
  const name = username.toLowerCase().trim();
  // Create user row
  const newUser = await sbFetch('POST', 'users', { username: name });
  const userRes = await sbFetch('GET', 'users', null, `username=eq.${name}&select=id`);
  if (!userRes || !userRes[0]) return { status: 'Error', message: 'Failed to create user' };
  const userId = userRes[0].id;

  // Create user settings row
  await sbFetch('POST', 'user_settings', { user_id: userId });

  // Copy template recipes to new user
  try {
    const templates = await sbFetch('GET', 'templates', null, 'select=*');
    if (templates && templates.length > 0) {
      const recipes = templates.map(t => ({
        user_id:      userId,
        title:        t.title,
        category:     t.category,
        ingredients:  t.ingredients || '',
        instructions: t.instructions || '',
        notes:        t.notes || '',
        cook_time:    t.cook_time || '',
        image_url:    t.image_url || '',
        favourite:    false,
        rating:       null
      }));
      await sbFetch('POST', 'recipes', recipes);
    }
  } catch(e) { console.error('Template copy failed:', e); }

  return { status: 'Success' };
}

// Get user ID by username
async function getUserId(username) {
  const data = await sbFetch('GET', 'users', null,
    `username=eq.${username.toLowerCase()}&select=id`);
  return data && data[0] ? data[0].id : null;
}

// ── RECIPE FUNCTIONS ─────────────────────────────────────────

// Get all recipes for a user — returns array in same format as old Apps Script
async function getRecipes(username) {
  const userId = await getUserId(username);
  if (!userId) return [];

  const data = await sbFetch('GET', 'recipes', null,
    `user_id=eq.${userId}&select=*&order=created_at.desc`);

  // Map Supabase columns back to the format the app expects
  return data.map(r => ({
    id:           r.id,
    category:     r.category || 'General',
    title:        r.title,
    ingredients:  r.ingredients || '',
    instructions: r.instructions || '',
    notes:        r.notes || '',
    date:         r.created_at,
    image:        r.image_url || '',
    favourite:    r.favourite || false,
    rating:       r.rating ? r.rating.toString() : '',
    cookTime:     r.cook_time || '',
    lastCooked:   r.last_cooked || ''
  }));
}

// Add a single recipe
async function addRecipe(username, recipe) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error', message: 'User not found' };

  // Duplicate check
  const existing = await sbFetch('GET', 'recipes', null,
    `user_id=eq.${userId}&title=ilike.${encodeURIComponent(recipe.title)}&select=id`);
  if (existing && existing.length > 0) {
    return { status: 'Error', message: `"${recipe.title}" is already in your cookbook.` };
  }

  await sbFetch('POST', 'recipes', {
    user_id:      userId,
    title:        recipe.title,
    category:     recipe.category || 'General',
    ingredients:  recipe.ingredients || '',
    instructions: recipe.instructions || '',
    notes:        recipe.notes || '',
    image_url:    recipe.image || '',
    cook_time:    recipe.cookTime || '',
    favourite:    false,
    rating:       null
  });

  return { status: 'Success', message: `"${recipe.title}" added to your cookbook!` };
}

// Update a recipe
async function updateRecipe(recipeId, updates) {
  const mapped = {
    title:        updates.title,
    category:     updates.category,
    ingredients:  updates.ingredients,
    instructions: updates.instructions,
    notes:        updates.notes,
    image_url:    updates.image,
    cook_time:    updates.cookTime
  };
  // Remove undefined keys
  Object.keys(mapped).forEach(k => mapped[k] === undefined && delete mapped[k]);
  await sbFetch('PATCH', `recipes?id=eq.${recipeId}`, mapped);
  return { status: 'Success' };
}

// Delete a recipe
async function deleteRecipe(recipeId) {
  await sbFetch('DELETE', `recipes?id=eq.${recipeId}`, null);
  return { status: 'Success' };
}

// Toggle favourite
async function toggleFavourite(recipeId, username) {
  // Get current state
  const data = await sbFetch('GET', 'recipes', null,
    `id=eq.${recipeId}&select=favourite`);
  if (!data || !data[0]) return { status: 'Error' };
  const newFav = !data[0].favourite;
  await sbFetch('PATCH', `recipes?id=eq.${recipeId}`, { favourite: newFav });
  return { status: 'Success', favourite: newFav };
}

// Set rating
async function setRating(recipeId, rating) {
  await sbFetch('PATCH', `recipes?id=eq.${recipeId}`,
    { rating: rating ? parseInt(rating) : null });
  return { status: 'Success' };
}

// ── PLANNER FUNCTIONS ────────────────────────────────────────

async function getWeekPlan(username, weekOf) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', days: {} };

  const data = await sbFetch('GET', 'planner', null,
    `user_id=eq.${userId}&week_of=eq.${weekOf}&select=*`);

  if (!data || data.length === 0) {
    return { status: 'Success', days: { Mon:{}, Tue:{}, Wed:{}, Thu:{}, Fri:{}, Sat:{}, Sun:{} } };
  }

  const row = data[0];
  return {
    status: 'Success',
    days: {
      Mon: row.monday   || {},
      Tue: row.tuesday  || {},
      Wed: row.wednesday|| {},
      Thu: row.thursday || {},
      Fri: row.friday   || {},
      Sat: row.saturday || {},
      Sun: row.sunday   || {}
    }
  };
}

async function saveWeekPlan(username, weekOf, days) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };

  const row = {
    user_id:   userId,
    week_of:   weekOf,
    monday:    days.Mon || {},
    tuesday:   days.Tue || {},
    wednesday: days.Wed || {},
    thursday:  days.Thu || {},
    friday:    days.Fri || {},
    saturday:  days.Sat || {},
    sunday:    days.Sun || {}
  };

  // Upsert — insert or update if exists
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Prefer': 'resolution=merge-duplicates'
  };
  await fetch(`${SUPABASE_URL}/rest/v1/planner`, {
    method: 'POST', headers, body: JSON.stringify(row)
  });
  return { status: 'Success' };
}

// ── FEATURED FUNCTIONS ───────────────────────────────────────

async function getFeatured() {
  const data = await sbFetch('GET', 'featured', null, 'select=*&order=created_at.desc');
  return {
    status: 'Success',
    recipes: data.map(r => ({ ...r.recipe_data, featuredId: r.id, featuredAt: r.created_at })),
    total: data.length
  };
}

async function addToFeatured(recipeData, username) {
  if (username !== 'rollert2') return { status: 'Error', message: 'Not authorized' };
  await sbFetch('POST', 'featured', { added_by: username, recipe_data: recipeData });
  return { status: 'Success', message: `"${recipeData.title}" added to Featured!` };
}

async function removeFromFeatured(featuredId, username) {
  if (username !== 'rollert2') return { status: 'Error', message: 'Not authorized' };
  await sbFetch('DELETE', `featured?id=eq.${featuredId}`, null);
  return { status: 'Success' };
}

// ── BLACKLIST FUNCTIONS ──────────────────────────────────────

async function getBlacklist() {
  const data = await sbFetch('GET', 'blacklist', null, 'select=domain');
  return { status: 'Success', domains: data.map(r => r.domain) };
}

async function addToBlacklist(domain, username) {
  try {
    await sbFetch('POST', 'blacklist', { domain: domain.toLowerCase(), blocked_by: username });
  } catch(e) {
    // Already blocked — ignore duplicate error
  }
  return { status: 'Success' };
}

// ── FRIENDS / FOLLOWS ────────────────────────────────────────

async function getFriends(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', following: [] };

  const data = await sbFetch('GET', 'follows', null,
    `follower_id=eq.${userId}&select=followee_id,users!follows_followee_id_fkey(username)`);

  return {
    status: 'Success',
    following: data.map(r => r.users.username)
  };
}

async function followUser(followerUsername, followeeUsername) {
  const followerId = await getUserId(followerUsername);
  const followeeId = await getUserId(followeeUsername);
  if (!followerId || !followeeId) return { status: 'Error', message: 'User not found' };

  try {
    await sbFetch('POST', 'follows', { follower_id: followerId, followee_id: followeeId });
  } catch(e) {
    return { status: 'Error', message: e.message };
  }
  return { status: 'Success' };
}

async function unfollowUser(followerUsername, followeeUsername) {
  const followerId = await getUserId(followerUsername);
  const followeeId = await getUserId(followeeUsername);
  if (!followerId || !followeeId) return { status: 'Error' };
  await sbFetch('DELETE', `follows?follower_id=eq.${followerId}&followee_id=eq.${followeeId}`, null);
  return { status: 'Success' };
}

async function getFriendRecipes(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', recipes: [] };
  const data = await sbFetch('GET', 'recipes', null,
    `user_id=eq.${userId}&select=*&order=created_at.desc`);
  return { status: 'Success', recipes: data.map(r => ({
    id: r.id, category: r.category, title: r.title,
    ingredients: r.ingredients, instructions: r.instructions,
    notes: r.notes, image: r.image_url, cookTime: r.cook_time, rating: r.rating
  }))};
}

// ── NOTIFICATIONS ────────────────────────────────────────────

async function getNotifications(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', notifications: [] };
  const data = await sbFetch('GET', 'notifications', null,
    `to_user_id=eq.${userId}&seen=eq.false&select=*,users!notifications_from_user_id_fkey(username)&order=created_at.desc`);
  return {
    status: 'Success',
    notifications: data.map(n => ({
      notifId:  n.id,
      fromUser: n.users.username,
      type:     n.type
    }))
  };
}

async function dismissNotification(notifId) {
  await sbFetch('PATCH', `notifications?id=eq.${notifId}`, { seen: true });
  return { status: 'Success' };
}

// ── INBOX / SHARING ──────────────────────────────────────────

async function sendRecipe(fromUsername, toUsername, recipeData) {
  const fromId = await getUserId(fromUsername);
  const toId   = await getUserId(toUsername);
  if (!fromId || !toId) return { status: 'Error', message: 'User not found' };
  await sbFetch('POST', 'inbox', {
    from_user_id: fromId,
    to_user_id:   toId,
    recipe_data:  recipeData,
    status:       'pending'
  });
  return { status: 'Success', message: `Recipe sent to ${toUsername}!` };
}

async function getInbox(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', items: [] };
  const data = await sbFetch('GET', 'inbox', null,
    `to_user_id=eq.${userId}&status=eq.pending&select=*,users!inbox_from_user_id_fkey(username)&order=created_at.desc`);
  return {
    status: 'Success',
    items: data.map(i => ({
      shareId:    i.id,
      fromUser:   i.users.username,
      recipeData: i.recipe_data
    }))
  };
}

async function respondToShare(shareId, username, accept) {
  if (accept) {
    // Get the recipe data first
    const data = await sbFetch('GET', 'inbox', null, `id=eq.${shareId}&select=recipe_data`);
    if (data && data[0]) {
      await addRecipe(username, data[0].recipe_data);
    }
  }
  await sbFetch('PATCH', `inbox?id=eq.${shareId}`, { status: accept ? 'accepted' : 'declined' });
  return { status: 'Success' };
}

// ── COLLECTIONS ──────────────────────────────────────────────

async function getCollections(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', collections: [] };
  const cols = await sbFetch('GET', 'collections', null,
    `user_id=eq.${userId}&select=id,name,collection_recipes(recipe_id)`);
  return {
    status: 'Success',
    collections: cols.map(c => ({
      id: c.id,
      name: c.name,
      recipeIds: (c.collection_recipes || []).map(r => r.recipe_id)
    }))
  };
}

async function createCollection(username, name) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error', message: 'User not found' };
  await sbFetch('POST', 'collections', { user_id: userId, name });
  return { status: 'Success' };
}

async function deleteCollection(collectionId, username) {
  await sbFetch('DELETE', `collections?id=eq.${collectionId}`, null);
  return { status: 'Success' };
}

async function addRecipeToCollection(collectionId, recipeId, username) {
  try { await sbFetch('POST', 'collection_recipes', { collection_id: collectionId, recipe_id: recipeId }); }
  catch(e) {}
  return { status: 'Success' };
}

// ── TOUR ─────────────────────────────────────────────────────

async function getTourStatus(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', complete: false, version: '0' };
  const data = await sbFetch('GET', 'user_settings', null,
    `user_id=eq.${userId}&select=tour_complete,tour_version`);
  if (!data || data.length === 0) return { status: 'Success', complete: false, version: '0' };
  return { status: 'Success', complete: data[0].tour_complete, version: data[0].tour_version };
}

async function completeTour(username) {
  const userId = await getUserId(username);
  if (!userId) return;
  await sbFetch('PATCH', `user_settings?user_id=eq.${userId}`, { tour_complete: true, tour_version: '3' });
}

// ── EXPORT / IMPORT ──────────────────────────────────────────

async function exportAllRecipes(username) {
  const recipes = await getRecipes(username);
  return { status: 'Success', data: JSON.stringify(recipes, null, 2) };
}

async function bulkImportRecipes(jsonInput, username) {
  let items;
  try { items = JSON.parse(jsonInput); } catch(e) { return { status: 'Error', message: 'Invalid JSON' }; }
  if (!Array.isArray(items)) items = [items];
  let added = 0, skipped = 0;
  for (const item of items) {
    const res = await addRecipe(username, item);
    if (res.status === 'Success') added++;
    else skipped++;
  }
  return { status: 'Success', message: `Added ${added} recipes.${skipped > 0 ? ' ' + skipped + ' skipped (duplicates).' : ''}` };
}

async function syncNewRecipe(jsonInput, username) {
  let item;
  try { item = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput; }
  catch(e) { return { status: 'Error', message: 'Invalid JSON' }; }
  return await addRecipe(username, item);
}

// ── IMAGE UPLOAD ─────────────────────────────────────────────

async function uploadImage(base64Data, fileName, recipeId, username) {
  try {
    const byteString = atob(base64Data.split(',')[1]);
    const mimeString = base64Data.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeString });
    const ext = fileName.split('.').pop() || 'jpg';
    const path = `recipes/${username}/${recipeId}.${ext}`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/recipe-images/${path}`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': mimeString, 'x-upsert': 'true' },
      body: blob
    });
    if (!res.ok) throw new Error('Upload failed');
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/recipe-images/${path}`;
    await sbFetch('PATCH', `recipes?id=eq.${recipeId}`, { image_url: publicUrl });
    return { status: 'Success', url: publicUrl };
  } catch(e) { return { status: 'Error', message: e.message }; }
}

// ── SCRAPE (placeholder — needs Vercel API route) ─────────────

async function scrapeRecipeWithAI(url, username) {
  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, username })
    });
    return await res.json();
  } catch(e) {
    return { status: 'Error', message: 'URL import unavailable. Please use manual entry for now.' };
  }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────

async function getNotifications(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', notifications: [] };
  const data = await sbFetch('GET', 'notifications', null,
    `to_user_id=eq.${userId}&seen=eq.false&select=id,type,from_user_id,users!notifications_from_user_id_fkey(username)&order=created_at.desc`);
  return {
    status: 'Success',
    notifications: data.map(n => ({ notifId: n.id, fromUser: n.users.username, type: n.type }))
  };
}

async function dismissNotification(notifId) {
  await sbFetch('PATCH', `notifications?id=eq.${notifId}`, { seen: true });
  return { status: 'Success' };
}

async function sendFollowNotification(fromUsername, toUsername) {
  const fromId = await getUserId(fromUsername);
  const toId = await getUserId(toUsername);
  if (!fromId || !toId) return;
  // Skip if already mutual
  const mutual = await sbFetch('GET', 'follows', null,
    `follower_id=eq.${toId}&followee_id=eq.${fromId}&select=follower_id`);
  if (mutual && mutual.length > 0) return;
  await sbFetch('POST', 'notifications', { to_user_id: toId, from_user_id: fromId, type: 'follow' });
}

async function getProfileStats(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', recipeCount: 0, favCount: 0, followingCount: 0 };
  const [recipes, favs, following] = await Promise.all([
    sbFetch('GET', 'recipes', null, `user_id=eq.${userId}&select=id`),
    sbFetch('GET', 'recipes', null, `user_id=eq.${userId}&favourite=eq.true&select=id`),
    sbFetch('GET', 'follows', null, `follower_id=eq.${userId}&select=followee_id`)
  ]);
  return {
    status: 'Success',
    recipeCount: recipes.length,
    favCount: favs.length,
    followingCount: following.length
  };
}
