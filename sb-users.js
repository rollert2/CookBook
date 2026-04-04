// ============================================================
// ROLL COOKBOOK — sb-users.js
// User management, auth, settings, profiles, deletion requests
// ============================================================

async function checkUsername(username) {
  const data = await sbFetch('GET', 'users', null,
    `username=eq.${username.toLowerCase()}&select=id,username`);
  return { status: 'Success', exists: data.length > 0, username: username.toLowerCase() };
}

async function createUser(username) {
  const name = username.toLowerCase().trim();
  await sbFetch('POST', 'users', { username: name });
  const userRes = await sbFetch('GET', 'users', null, `username=eq.${name}&select=id`);
  if (!userRes || !userRes[0]) return { status: 'Error', message: 'Failed to create user' };
  const userId = userRes[0].id;

  await sbFetch('POST', 'user_settings', { user_id: userId });

  // Copy template recipes
  try {
    const templates = await sbFetch('GET', 'templates', null, 'select=*');
    if (templates && templates.length > 0) {
      const recipes = templates.map(t => ({
        user_id: userId, title: t.title, category: t.category,
        ingredients: t.ingredients || '', instructions: t.instructions || '',
        notes: t.notes || '', cook_time: t.cook_time || '',
        image_url: t.image_url || '', favourite: false, rating: null
      }));
      await sbFetch('POST', 'recipes', recipes);
    }
  } catch(e) { console.error('Template copy failed:', e); }

  // NOTE: Auto-follow rollert2 removed — users start with no follows

  return { status: 'Success' };
}

async function getUserId(username) {
  const data = await sbFetch('GET', 'users', null,
    `username=eq.${username.toLowerCase()}&select=id`);
  return data && data[0] ? data[0].id : null;
}

async function getUserProfile(username) {
  const data = await sbFetch('GET', 'users', null,
    `username=eq.${username.toLowerCase()}&select=id,username,avatar_url,bio,is_private,created_at`);
  return data && data[0] ? data[0] : null;
}

async function updateUserProfile(username, updates) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  const allowed = {};
  if (updates.bio !== undefined) allowed.bio = updates.bio;
  if (updates.is_private !== undefined) allowed.is_private = updates.is_private;
  await sbFetch('PATCH', `users?id=eq.${userId}`, allowed);
  return { status: 'Success' };
}

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
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/profile-pictures/${path}`, {
      method: 'PUT',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'image/jpeg', 'x-upsert': 'true'
      },
      body: blob
    });
    if (!res.ok) throw new Error('Storage error: ' + await res.text());
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/profile-pictures/${path}?t=${Date.now()}`;
    const userId = await getUserId(username);
    if (userId) await sbFetch('PATCH', `users?id=eq.${userId}`, { avatar_url: publicUrl });
    return { status: 'Success', url: publicUrl };
  } catch(e) { return { status: 'Error', message: e.message }; }
}

async function getUserAvatar(username) {
  const data = await sbFetch('GET', 'users', null, `username=eq.${username}&select=avatar_url`);
  return data && data[0] ? data[0].avatar_url || null : null;
}

async function getProfileStats(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', recipeCount: 0, favCount: 0, followingCount: 0, followerCount: 0 };
  const [recipes, favs, following, followers] = await Promise.all([
    sbFetch('GET', 'recipes', null, `user_id=eq.${userId}&select=id`),
    sbFetch('GET', 'recipes', null, `user_id=eq.${userId}&favourite=eq.true&select=id`),
    sbFetch('GET', 'follows', null, `follower_id=eq.${userId}&select=followee_id`),
    sbFetch('GET', 'follows', null, `followee_id=eq.${userId}&select=follower_id`)
  ]);
  return {
    status: 'Success',
    recipeCount: (recipes || []).length,
    favCount: (favs || []).length,
    followingCount: (following || []).length,
    followerCount: (followers || []).length
  };
}

// ── DELETION REQUESTS ─────────────────────────────────────────

async function requestAccountDeletion(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error', message: 'User not found' };
  const deleteAfter = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  // Upsert deletion request
  const existing = await sbFetch('GET', 'deletion_requests', null, `username=eq.${username}&select=id`);
  if (existing && existing.length > 0) {
    await sbFetch('PATCH', `deletion_requests?username=eq.${username}`,
      { cancelled: false, requested_at: new Date().toISOString(), delete_after: deleteAfter });
  } else {
    await sbFetch('POST', 'deletion_requests', { username, user_id: userId, delete_after: deleteAfter });
  }
  // Notify rollert2
  const adminId = await getUserId('rollert2');
  if (adminId && adminId !== userId) {
    await sbFetch('POST', 'notifications', {
      to_user_id: adminId, from_user_id: userId,
      type: 'deletion_request',
      meta: JSON.stringify({ username, delete_after: deleteAfter })
    });
  }
  return { status: 'Success', deleteAfter };
}

async function cancelDeletionRequest(username) {
  await sbFetch('PATCH', `deletion_requests?username=eq.${username}`, { cancelled: true });
  return { status: 'Success' };
}

async function getDeletionRequest(username) {
  const data = await sbFetch('GET', 'deletion_requests', null,
    `username=eq.${username}&cancelled=eq.false&select=*`);
  return data && data[0] ? data[0] : null;
}

async function getPendingDeletionRequests() {
  const data = await sbFetch('GET', 'deletion_requests', null,
    `cancelled=eq.false&select=*&order=requested_at.desc`);
  return data || [];
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
  await sbFetch('PATCH', `user_settings?user_id=eq.${userId}`,
    { tour_complete: true, tour_version: '3' });
}

// ── ADMIN ─────────────────────────────────────────────────────

async function getAdminSettings() {
  const data = await sbFetch('GET', 'admin_settings', null, 'select=*&limit=1');
  if (!data || data.length === 0) return { status: 'Success', settings: {} };
  return { status: 'Success', settings: data[0] };
}

async function updateAdminSettings(settings) {
  try {
    let data = await sbFetch('GET', 'admin_settings', null, 'select=id&limit=1');
    if (!data || data.length === 0) {
      await sbFetch('POST', 'admin_settings', { timer_tone: 'default' });
      data = await sbFetch('GET', 'admin_settings', null, 'select=id&limit=1');
    }
    if (!data || data.length === 0) return { status: 'Error', message: 'Could not find admin settings' };
    const clean = { ...settings };
    delete clean.updated_at;
    await sbFetch('PATCH', `admin_settings?id=eq.${data[0].id}`, clean);
    return { status: 'Success' };
  } catch(e) { return { status: 'Error', message: e.message }; }
}

// Check saved users still exist (for login screen cleanup)
async function validateSavedUsers(usernames) {
  if (!usernames || usernames.length === 0) return [];
  const data = await sbFetch('GET', 'users', null,
    `username=in.(${usernames.join(',')})&select=username`).catch(() => []);
  const valid = new Set((data || []).map(u => u.username));
  return usernames.filter(u => valid.has(u));
}
