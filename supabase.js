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

  // Auto-follow rollert2 for all new users
  try {
    const adminId = await getUserId('rollert2');
    if (adminId && adminId !== userId) {
      await sbFetch('POST', 'follows', { follower_id: userId, followee_id: adminId });
    }
  } catch(e) { console.error('Auto-follow failed:', e); }

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
    servings:     r.servings || '',
    sourceUrl:    r.source_url || '',
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
    image_url:    recipe.image_url || recipe.image || '',
    cook_time:    recipe.cookTime || recipe.cook_time || '',
    servings:     recipe.servings || '',
    source_url:   recipe.source_url || '',
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
    image_url:    updates.image || updates.image_url,
    cook_time:    updates.cookTime || updates.cook_time,
    servings:     updates.servings,
    source_url:   updates.sourceUrl || updates.source_url
  };
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

// ── USER SETTINGS ─────────────────────────────────────────────

async function getUserSettings(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', settings: {} };
  const data = await sbFetch('GET', 'user_settings', null, `user_id=eq.${userId}&select=*`);
  if (!data || data.length === 0) {
    await sbFetch('POST', 'user_settings', { user_id: userId });
    return { status: 'Success', settings: {} };
  }
  return { status: 'Success', settings: data[0] };
}

async function updateUserSettings(username, settings) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error', message: 'User not found' };
  await sbFetch('PATCH', `user_settings?user_id=eq.${userId}`, settings);
  return { status: 'Success' };
}

// ── ADMIN SETTINGS ────────────────────────────────────────────

async function getAdminSettings() {
  const data = await sbFetch('GET', 'admin_settings', null, 'select=*&limit=1');
  if (!data || data.length === 0) return { status: 'Success', settings: {} };
  return { status: 'Success', settings: data[0] };
}

async function updateAdminSettings(settings) {
  try {
    // Get or create the admin settings row
    let data = await sbFetch('GET', 'admin_settings', null, 'select=id&limit=1');
    if (!data || data.length === 0) {
      // Insert a new row
      await sbFetch('POST', 'admin_settings', { timer_tone: 'default' });
      data = await sbFetch('GET', 'admin_settings', null, 'select=id&limit=1');
    }
    if (!data || data.length === 0) return { status: 'Error', message: 'Could not find admin settings' };
    // Remove updated_at if column doesn't exist - only send the actual settings
    const cleanSettings = { ...settings };
    delete cleanSettings.updated_at;
    await sbFetch('PATCH', `admin_settings?id=eq.${data[0].id}`, cleanSettings);
    return { status: 'Success' };
  } catch(e) {
    console.error('updateAdminSettings error:', e);
    return { status: 'Error', message: e.message };
  }
}

// ── PROFILE PICTURE ───────────────────────────────────────────

async function uploadProfilePicture(base64Data, fileName, username) {
  try {
    const parts = base64Data.split(',');
    const byteString = atob(parts[1]);
    const mimeString = parts[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeString });
    const path = `avatars/${username}.jpg`;
    // Use PUT with x-upsert for create-or-replace
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/profile-pictures/${path}`, {
      method: 'PUT',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true'
      },
      body: blob
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error('Storage error: ' + errText);
    }
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/profile-pictures/${path}?t=${Date.now()}`;
    const userId = await getUserId(username);
    if (userId) await sbFetch('PATCH', `users?id=eq.${userId}`, { avatar_url: publicUrl });
    return { status: 'Success', url: publicUrl };
  } catch(e) {
    console.error('uploadProfilePicture error:', e);
    return { status: 'Error', message: e.message };
  }
}

async function getUserAvatar(username) {
  const data = await sbFetch('GET', 'users', null, `username=eq.${username}&select=avatar_url`);
  if (!data || !data[0]) return null;
  return data[0].avatar_url || null;
}

// ── MESSAGING ─────────────────────────────────────────────────

async function getConversations(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', conversations: [] };
  const data = await sbFetch('GET', 'messages', null,
    `or=(from_user_id.eq.${userId},to_user_id.eq.${userId})&status=neq.declined&select=*,from_user:users!messages_from_user_id_fkey(username,avatar_url),to_user:users!messages_to_user_id_fkey(username,avatar_url)&order=created_at.desc`);
  // Group by conversation partner
  const convMap = {};
  (data || []).forEach(msg => {
    const partner = msg.from_user.username === username ? msg.to_user.username : msg.from_user.username;
    const partnerAvatar = msg.from_user.username === username ? msg.to_user.avatar_url : msg.from_user.avatar_url;
    if (!convMap[partner]) convMap[partner] = { partner, partnerAvatar, messages: [], unread: 0, lastMsg: null, status: msg.status };
    convMap[partner].messages.push(msg);
    if (!convMap[partner].lastMsg) convMap[partner].lastMsg = msg;
    if (msg.to_user.username === username && msg.status === 'delivered') convMap[partner].unread++;
  });
  return { status: 'Success', conversations: Object.values(convMap) };
}

async function getMessages(username, partnerUsername) {
  const userId = await getUserId(username);
  const partnerId = await getUserId(partnerUsername);
  if (!userId || !partnerId) return { status: 'Success', messages: [] };
  const data = await sbFetch('GET', 'messages', null,
    `or=(and(from_user_id.eq.${userId},to_user_id.eq.${partnerId}),and(from_user_id.eq.${partnerId},to_user_id.eq.${userId}))&status=neq.declined&order=created_at.asc&select=*`);
  // Mark delivered messages as read
  const unreadIds = (data || []).filter(m => m.to_user_id === userId && m.status === 'delivered').map(m => m.id);
  if (unreadIds.length > 0) {
    await sbFetch('PATCH', `messages?id=in.(${unreadIds.join(',')})`, { status: 'read' });
  }
  return { status: 'Success', messages: data || [] };
}

async function sendMessage(fromUsername, toUsername, content) {
  const fromId = await getUserId(fromUsername);
  const toId = await getUserId(toUsername);
  if (!fromId || !toId) return { status: 'Error', message: 'User not found' };
  // Check if blocked
  const blocked = await sbFetch('GET', 'blocked_users', null,
    `or=(and(blocker_id.eq.${toId},blocked_id.eq.${fromId}),and(blocker_id.eq.${fromId},blocked_id.eq.${toId}))&select=id`);
  if (blocked && blocked.length > 0) return { status: 'Error', message: 'Cannot send message' };
  // Check if mutual follows — if not, send as request
  const mutualFollow = await sbFetch('GET', 'follows', null,
    `follower_id=eq.${toId}&followee_id=eq.${fromId}&select=follower_id`);
  const status = (mutualFollow && mutualFollow.length > 0) ? 'delivered' : 'pending';
  await sbFetch('POST', 'messages', { from_user_id: fromId, to_user_id: toId, content, status });
  return { status: 'Success', messageStatus: status };
}

async function respondToMessage(messageId, accept) {
  if (accept) {
    await sbFetch('PATCH', `messages?id=eq.${messageId}`, { status: 'delivered' });
  } else {
    await sbFetch('PATCH', `messages?id=eq.${messageId}`, { status: 'declined' });
  }
  return { status: 'Success' };
}

async function getMessageRequests(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', requests: [] };
  const data = await sbFetch('GET', 'messages', null,
    `to_user_id=eq.${userId}&status=eq.pending&select=*,from_user:users!messages_from_user_id_fkey(username,avatar_url)&order=created_at.desc`);
  return { status: 'Success', requests: data || [] };
}

async function blockUser(blockerUsername, blockedUsername) {
  const blockerId = await getUserId(blockerUsername);
  const blockedId = await getUserId(blockedUsername);
  if (!blockerId || !blockedId) return { status: 'Error', message: 'User not found' };
  try { await sbFetch('POST', 'blocked_users', { blocker_id: blockerId, blocked_id: blockedId }); }
  catch(e) {}
  return { status: 'Success' };
}

async function getUnreadMessageCount(username) {
  const userId = await getUserId(username);
  if (!userId) return 0;
  const data = await sbFetch('GET', 'messages', null,
    `to_user_id=eq.${userId}&status=eq.delivered&select=id`);
  return (data || []).length;
}

// ── COLLECTION SHARING ────────────────────────────────────────

async function getPublicCollections(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', collections: [] };
  const cols = await sbFetch('GET', 'collections', null,
    `user_id=eq.${userId}&is_public=eq.true&select=id,name,collection_recipes(recipe_id)`);
  return {
    status: 'Success',
    collections: cols.map(c => ({
      id: c.id,
      name: c.name,
      recipeIds: (c.collection_recipes || []).map(r => r.recipe_id)
    }))
  };
}

async function getFriendCollectionRecipes(collectionId) {
  const data = await sbFetch('GET', 'collection_recipes', null,
    `collection_id=eq.${collectionId}&select=recipe_id,recipes(id,title,category,ingredients,instructions,notes,cook_time,image_url,servings)`);
  const recipes = (data || []).map(r => r.recipes).filter(Boolean);
  return { status: 'Success', recipes };
}

// ── FOLLOW-BACK NOTIFICATION ──────────────────────────────────

async function sendFollowBackNotification(fromUsername, toUsername) {
  const fromId = await getUserId(fromUsername);
  const toId = await getUserId(toUsername);
  if (!fromId || !toId) return;
  await sbFetch('POST', 'notifications', { to_user_id: toId, from_user_id: fromId, type: 'follow_back' });
}

// ── COLLECTION WITH VISIBILITY ────────────────────────────────

async function createCollectionWithVisibility(username, name, isPublic) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error', message: 'User not found' };
  await sbFetch('POST', 'collections', { user_id: userId, name, is_public: isPublic });
  return { status: 'Success' };
}

// Make sbFetch available globally for admin panel direct queries
window._sbFetch = sbFetch;

// ── RECIPE SHARES ─────────────────────────────────────────────

async function createShareLink(recipeId, username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error', message: 'User not found' };
  // Upsert — create or re-enable
  const existing = await sbFetch('GET', 'recipe_shares', null, `recipe_id=eq.${recipeId}&user_id=eq.${userId}&select=id`);
  if (existing && existing.length > 0) {
    await sbFetch('PATCH', `recipe_shares?id=eq.${existing[0].id}`, { active: true });
  } else {
    await sbFetch('POST', 'recipe_shares', { recipe_id: recipeId, user_id: userId, active: true });
  }
  return { status: 'Success', url: `https://rollcookbook.vercel.app/api/recipe?id=${recipeId}` };
}

async function getShareStatus(recipeId, username) {
  const userId = await getUserId(username);
  if (!userId) return { active: false };
  const data = await sbFetch('GET', 'recipe_shares', null, `recipe_id=eq.${recipeId}&user_id=eq.${userId}&select=active`);
  if (!data || data.length === 0) return { active: false };
  return { active: data[0].active };
}

async function setShareActive(recipeId, username, active) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  const existing = await sbFetch('GET', 'recipe_shares', null, `recipe_id=eq.${recipeId}&user_id=eq.${userId}&select=id`);
  if (existing && existing.length > 0) {
    await sbFetch('PATCH', `recipe_shares?id=eq.${existing[0].id}`, { active });
  } else if (active) {
    await sbFetch('POST', 'recipe_shares', { recipe_id: recipeId, user_id: userId, active: true });
  }
  return { status: 'Success' };
}

async function addRecipeFromPublicLink(recipeId, username) {
  // Get the recipe data
  const recipes = await sbFetch('GET', 'recipes', null, `id=eq.${recipeId}&select=*`);
  if (!recipes || recipes.length === 0) return { status: 'Error', message: 'Recipe not found' };
  const r = recipes[0];
  return await addRecipe(username, {
    title: r.title, category: r.category, ingredients: r.ingredients,
    instructions: r.instructions, notes: r.notes, cook_time: r.cook_time,
    servings: r.servings, image_url: r.image_url
  });
}

// ── FRIEND RATINGS ────────────────────────────────────────────

async function setFriendRating(recipeId, raterUsername, rating) {
  const raterId = await getUserId(raterUsername);
  if (!raterId) return { status: 'Error', message: 'User not found' };
  // Upsert
  const existing = await sbFetch('GET', 'friend_ratings', null, `recipe_id=eq.${recipeId}&rater_user_id=eq.${raterId}&select=id`);
  if (existing && existing.length > 0) {
    await sbFetch('PATCH', `friend_ratings?id=eq.${existing[0].id}`, { rating });
  } else {
    await sbFetch('POST', 'friend_ratings', { recipe_id: recipeId, rater_user_id: raterId, rating });
  }
  // Notify recipe owner
  const recipeData = await sbFetch('GET', 'recipes', null, `id=eq.${recipeId}&select=user_id,title`);
  if (recipeData && recipeData[0] && recipeData[0].user_id !== raterId) {
    await sbFetch('POST', 'notifications', {
      to_user_id: recipeData[0].user_id,
      from_user_id: raterId,
      type: 'friend_rating',
      meta: JSON.stringify({ recipe_id: recipeId, recipe_title: recipeData[0].title, rating })
    });
  }
  return { status: 'Success' };
}

async function getFriendRatings(recipeId, username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', ratings: [], average: null };
  // Get who this user follows
  const follows = await sbFetch('GET', 'follows', null, `follower_id=eq.${userId}&select=followee_id`);
  if (!follows || follows.length === 0) return { status: 'Success', ratings: [], average: null };
  const followeeIds = follows.map(f => f.followee_id);
  const data = await sbFetch('GET', 'friend_ratings', null,
    `recipe_id=eq.${recipeId}&rater_user_id=in.(${followeeIds.join(',')})&select=rating,rater_user_id,users!friend_ratings_rater_user_id_fkey(username,avatar_url)`);
  if (!data || data.length === 0) return { status: 'Success', ratings: [], average: null };
  const ratings = data.map(d => ({
    username: d.users.username,
    avatarUrl: d.users.avatar_url,
    rating: d.rating
  }));
  const average = Math.round(ratings.reduce((s, r) => s + r.rating, 0) / ratings.length * 10) / 10;
  return { status: 'Success', ratings, average };
}

// ── ROTD PER USER ─────────────────────────────────────────────

async function getOrSetRotd(username) {
  const userId = await getUserId(username);
  if (!userId) return null;
  const today = new Date().toISOString().slice(0, 10);

  // Check admin override first (columns may not exist yet — fully guarded)
  try {
    const adminRes = await getAdminSettings();
    const s = adminRes.settings || {};
    if (s.rotd_override_id && s.rotd_override_date === today) {
      const r = await sbFetch('GET', 'recipes', null, `id=eq.${s.rotd_override_id}&select=*`);
      if (r && r[0]) return r[0];
    }
  } catch(e) {}

  // Try per-user saved ROTD (columns may not exist — guarded)
  try {
    const settings = await sbFetch('GET', 'user_settings', null, `user_id=eq.${userId}&select=rotd_recipe_id,rotd_date`);
    if (settings && settings[0] && settings[0].rotd_date === today && settings[0].rotd_recipe_id) {
      const r = await sbFetch('GET', 'recipes', null, `id=eq.${settings[0].rotd_recipe_id}&select=*`);
      if (r && r[0]) return r[0];
    }
  } catch(e) {}

  // Always fall back: pick random recipe using date as seed
  const recipes = await sbFetch('GET', 'recipes', null, `user_id=eq.${userId}&select=*`);
  if (!recipes || recipes.length === 0) return null;
  // Deterministic daily pick based on date string
  const seed = today.split('-').reduce((a, b) => a + parseInt(b), 0);
  const pick = recipes[seed % recipes.length];
  // Try to save for today — silently ignore if columns don't exist
  try {
    await sbFetch('PATCH', `user_settings?user_id=eq.${userId}`, { rotd_recipe_id: pick.id, rotd_date: today });
  } catch(e) {}
  return pick;
}

// ── PLANNER (EXTENDED) ────────────────────────────────────────

async function getPlannerWeek(username, weekStart) {
  const userId = await getUserId(username);
  if (!userId) return [];
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const endStr = weekEnd.toISOString().slice(0,10);
  const data = await sbFetch('GET', 'planner', null,
    `user_id=eq.${userId}&date=gte.${weekStart}&date=lte.${endStr}&select=*,recipes(id,title,image_url,cook_time,category,ingredients,instructions,notes,servings)&order=date.asc`);
  return data || [];
}

async function addPlannerEntry(username, date, recipeId, mealType) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  await sbFetch('POST', 'planner', { user_id: userId, date, recipe_id: recipeId, meal_type: mealType });
  return { status: 'Success' };
}

async function removePlannerEntry(entryId) {
  await sbFetch('DELETE', `planner?id=eq.${entryId}`, null);
  return { status: 'Success' };
}

async function getPlannerRange(username, startDate, endDate) {
  const userId = await getUserId(username);
  if (!userId) return [];
  // First get planner entries
  const entries = await sbFetch('GET', 'planner', null,
    `user_id=eq.${userId}&date=gte.${startDate}&date=lte.${endDate}&select=id,date,recipe_id,meal_type&order=date.asc`);
  if (!entries || entries.length === 0) return [];
  // Fetch recipes separately to avoid join issues
  const recipeIds = [...new Set(entries.map(e => e.recipe_id).filter(Boolean))];
  let recipesMap = {};
  if (recipeIds.length > 0) {
    const recipes = await sbFetch('GET', 'recipes', null, `id=in.(${recipeIds.join(',')})&select=id,title,image_url,cook_time,category,ingredients`);
    (recipes || []).forEach(r => { recipesMap[r.id] = r; });
  }
  return entries.map(e => ({ ...e, recipes: recipesMap[e.recipe_id] || null }));
}

// ── MEAL PREP ─────────────────────────────────────────────────

async function getMealPrepItems(username) {
  const userId = await getUserId(username);
  if (!userId) return [];
  const items = await sbFetch('GET', 'meal_prep', null,
    `user_id=eq.${userId}&select=id,recipe_id,scale,total_servings,servings_used,prep_date,notes,created_at&order=created_at.desc`);
  if (!items || items.length === 0) return [];
  const recipeIds = [...new Set(items.map(e => e.recipe_id).filter(Boolean))];
  let recipesMap = {};
  if (recipeIds.length > 0) {
    const recipes = await sbFetch('GET', 'recipes', null, `id=in.(${recipeIds.join(',')})&select=id,title,image_url,ingredients,instructions,servings,cook_time`);
    (recipes || []).forEach(r => { recipesMap[r.id] = r; });
  }
  return items.map(e => ({ ...e, recipes: recipesMap[e.recipe_id] || null }));
}

async function addMealPrepItem(username, recipeId, scale, totalServings, prepDate, notes) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  await sbFetch('POST', 'meal_prep', {
    user_id: userId, recipe_id: recipeId,
    scale: scale || 1, total_servings: totalServings || 1,
    servings_used: 0, prep_date: prepDate || null, notes: notes || ''
  });
  return { status: 'Success' };
}

async function updateMealPrepServings(itemId, servingsUsed) {
  await sbFetch('PATCH', `meal_prep?id=eq.${itemId}`, { servings_used: servingsUsed });
  return { status: 'Success' };
}

async function deleteMealPrepItem(itemId) {
  await sbFetch('DELETE', `meal_prep?id=eq.${itemId}`, null);
  return { status: 'Success' };
}

// ── COMMUNITY ─────────────────────────────────────────────────

async function getCommunityPosts(category, sortBy, limit, offset) {
  let query = `removed=eq.false&select=*,users!community_posts_user_id_fkey(username,avatar_url)`;
  if (category && category !== 'All') query += `&category=eq.${encodeURIComponent(category)}`;
  if (sortBy === 'top') query += `&order=upvotes.desc,created_at.desc`;
  else query += `&order=created_at.desc`;
  query += `&limit=${limit || 20}&offset=${offset || 0}`;
  const data = await sbFetch('GET', 'community_posts', null, query);
  return data || [];
}

async function createCommunityPost(username, postData) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error', message: 'User not found' };
  await sbFetch('POST', 'community_posts', {
    user_id: userId,
    recipe_id: postData.recipeId || null,
    title: postData.title,
    category: postData.category || 'General',
    image_url: postData.image_url || null,
    attempt_photo_url: postData.attempt_photo_url || null,
    ingredients: postData.ingredients || '',
    instructions: postData.instructions || '',
    notes: postData.notes || '',
    cook_time: postData.cook_time || '',
    servings: postData.servings || ''
  });
  return { status: 'Success' };
}

async function upvoteCommunityPost(postId, username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  // Check if already upvoted
  const existing = await sbFetch('GET', 'community_upvotes', null, `post_id=eq.${postId}&user_id=eq.${userId}&select=id`);
  if (existing && existing.length > 0) {
    // Remove upvote (toggle)
    await sbFetch('DELETE', `community_upvotes?post_id=eq.${postId}&user_id=eq.${userId}`, null);
    await sbFetch('PATCH', `community_posts?id=eq.${postId}`, { upvotes: -1 }); // decremented server-side ideally
    return { status: 'Success', action: 'removed' };
  }
  await sbFetch('POST', 'community_upvotes', { post_id: postId, user_id: userId });
  // Increment upvote count
  const post = await sbFetch('GET', 'community_posts', null, `id=eq.${postId}&select=upvotes`);
  if (post && post[0]) {
    await sbFetch('PATCH', `community_posts?id=eq.${postId}`, { upvotes: (post[0].upvotes || 0) + 1 });
  }
  return { status: 'Success', action: 'added' };
}

async function hasUpvotedPost(postId, username) {
  const userId = await getUserId(username);
  if (!userId) return false;
  const data = await sbFetch('GET', 'community_upvotes', null, `post_id=eq.${postId}&user_id=eq.${userId}&select=id`);
  return data && data.length > 0;
}

async function getCommunityComments(postId) {
  const data = await sbFetch('GET', 'community_comments', null,
    `post_id=eq.${postId}&select=*,users!community_comments_user_id_fkey(username,avatar_url)&order=created_at.asc`);
  return data || [];
}

async function addCommunityComment(postId, username, content) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  await sbFetch('POST', 'community_comments', { post_id: postId, user_id: userId, content });
  return { status: 'Success' };
}

async function removeCommunityPost(postId) {
  await sbFetch('PATCH', `community_posts?id=eq.${postId}`, { removed: true });
  return { status: 'Success' };
}

async function uploadCommunityPhoto(base64Data, filename, username) {
  try {
    const parts = base64Data.split(',');
    const byteString = atob(parts[1]);
    const mimeString = parts[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeString });
    const path = `community/${username}_${Date.now()}.jpg`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/recipe-images/${path}`, {
      method: 'PUT',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: blob
    });
    if (!res.ok) throw new Error('Upload failed');
    return { status: 'Success', url: `${SUPABASE_URL}/storage/v1/object/public/recipe-images/${path}` };
  } catch(e) { return { status: 'Error', message: e.message }; }
}
