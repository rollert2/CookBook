// ============================================================
// ROLL COOKBOOK — Supabase Client
// ============================================================

const SUPABASE_URL = 'https://rxedycriglsypezlpdrz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4ZWR5Y3JpZ2xzeXBlemxwZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0NzA3MDIsImV4cCI6MjA1OTA0NjcwMn0.placeholder';

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
  await sbFetch('POST', 'users', { username: name });
  // Create user settings row
  const userRes = await sbFetch('GET', 'users', null, `username=eq.${name}&select=id`);
  if (userRes && userRes[0]) {
    await sbFetch('POST', 'user_settings', { user_id: userRes[0].id });
  }
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
