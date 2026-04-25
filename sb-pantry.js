// ============================================================
// ROLL COOKBOOK — sb-pantry.js
// Personal pantry (localStorage + Supabase sync) + shared pantries
// ============================================================

// ── SHARED PANTRIES ────────────────────────────────────────────

async function getMySharedPantries(username) {
  const data = await sbFetch('GET', 'pantries', null,
    `or=(owner_username.eq.${username},members.cs.{${username}})&select=*&order=created_at.desc`);
  return data || [];
}

async function createSharedPantry(username, name) {
  const data = await sbFetch('POST', 'pantries', {
    name, owner_username: username, members: []
  });
  return data && data[0] ? data[0] : null;
}

async function deleteSharedPantry(pantryId, username) {
  await sbFetch('DELETE', `pantries?id=eq.${pantryId}&owner_username=eq.${username}`, null);
  // Delete all items too
  await sbFetch('DELETE', `pantry_items?pantry_id=eq.${pantryId}`, null);
  return { status: 'Success' };
}

async function addMemberToSharedPantry(pantryId, memberUsername) {
  const pantry = await sbFetch('GET', 'pantries', null, `id=eq.${pantryId}&select=members`);
  if (!pantry || !pantry[0]) return { status: 'Error', message: 'Pantry not found' };
  const members = pantry[0].members || [];
  if (!members.includes(memberUsername)) {
    members.push(memberUsername);
    await sbFetch('PATCH', `pantries?id=eq.${pantryId}`, { members });
  }
  return { status: 'Success' };
}

async function leaveSharedPantry(pantryId, username) {
  const pantry = await sbFetch('GET', 'pantries', null, `id=eq.${pantryId}&select=members`);
  if (!pantry || !pantry[0]) return { status: 'Error' };
  const members = (pantry[0].members || []).filter(m => m !== username);
  await sbFetch('PATCH', `pantries?id=eq.${pantryId}`, { members });
  return { status: 'Success' };
}

async function renameSharedPantry(pantryId, newName) {
  await sbFetch('PATCH', `pantries?id=eq.${pantryId}`, { name: newName });
  return { status: 'Success' };
}

// ── SHARED PANTRY ITEMS ───────────────────────────────────────

async function getSharedPantryItems(pantryId) {
  const data = await sbFetch('GET', 'pantry_items', null,
    `pantry_id=eq.${pantryId}&select=*&order=created_at.asc`);
  return data || [];
}

async function addSharedPantryItem(pantryId, name, quantity, expiry, addedBy) {
  const item = await sbFetch('POST', 'pantry_items', {
    pantry_id: pantryId,
    name: (name || '').toLowerCase().trim(),
    quantity: quantity || '',
    expiry: expiry || '',
    added_by: addedBy || null
  });
  return item && item[0] ? item[0] : null;
}

async function removeSharedPantryItem(itemId) {
  await sbFetch('DELETE', `pantry_items?id=eq.${itemId}`, null);
  return { status: 'Success' };
}

async function updateSharedPantryItem(itemId, updates) {
  await sbFetch('PATCH', `pantry_items?id=eq.${itemId}`, updates);
  return { status: 'Success' };
}

async function clearAllSharedPantryItems(pantryId) {
  await sbFetch('DELETE', `pantry_items?pantry_id=eq.${pantryId}`, null);
  return { status: 'Success' };
}
