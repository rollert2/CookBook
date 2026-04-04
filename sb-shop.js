// ============================================================
// ROLL COOKBOOK — sb-shop.js
// Personal shopping (localStorage) + shared shopping lists
// ============================================================

// ── SHARED SHOPPING LISTS ──────────────────────────────────────

async function getMySharedLists(username) {
  const data = await sbFetch('GET', 'shopping_lists', null,
    `or=(owner_username.eq.${username},members.cs.{${username}})&select=*&order=created_at.desc`);
  return data || [];
}

async function createSharedList(username, name) {
  const data = await sbFetch('POST', 'shopping_lists', {
    name, owner_username: username, members: []
  });
  return data && data[0] ? data[0] : null;
}

async function deleteSharedList(listId, username) {
  // Only owner can delete
  await sbFetch('DELETE', `shopping_lists?id=eq.${listId}&owner_username=eq.${username}`, null);
  return { status: 'Success' };
}

async function addMemberToSharedList(listId, memberUsername) {
  const list = await sbFetch('GET', 'shopping_lists', null, `id=eq.${listId}&select=members`);
  if (!list || !list[0]) return { status: 'Error', message: 'List not found' };
  const members = list[0].members || [];
  if (!members.includes(memberUsername)) {
    members.push(memberUsername);
    await sbFetch('PATCH', `shopping_lists?id=eq.${listId}`, { members });
  }
  return { status: 'Success' };
}

async function leaveSharedList(listId, username) {
  const list = await sbFetch('GET', 'shopping_lists', null, `id=eq.${listId}&select=members`);
  if (!list || !list[0]) return { status: 'Error' };
  const members = (list[0].members || []).filter(m => m !== username);
  await sbFetch('PATCH', `shopping_lists?id=eq.${listId}`, { members });
  return { status: 'Success' };
}

async function getSharedListItems(listId) {
  const data = await sbFetch('GET', 'shopping_list_items', null,
    `list_id=eq.${listId}&select=*&order=created_at.asc`);
  return data || [];
}

async function addSharedListItem(listId, text, itemGroup, recipeId, recipeTitle, addedBy) {
  const item = await sbFetch('POST', 'shopping_list_items', {
    list_id: listId, text, checked: false,
    item_group: itemGroup || 'Other',
    recipe_id: recipeId || null,
    recipe_title: recipeTitle || null,
    added_by: addedBy || null
  });
  return item && item[0] ? item[0] : null;
}

async function toggleSharedListItem(itemId, checked) {
  await sbFetch('PATCH', `shopping_list_items?id=eq.${itemId}`, { checked });
  return { status: 'Success' };
}

async function deleteSharedListItem(itemId) {
  await sbFetch('DELETE', `shopping_list_items?id=eq.${itemId}`, null);
  return { status: 'Success' };
}

async function removeRecipeFromSharedList(listId, recipeId) {
  // Delete all items from this recipe
  await sbFetch('DELETE', `shopping_list_items?list_id=eq.${listId}&recipe_id=eq.${recipeId}`, null);
  return { status: 'Success' };
}

async function clearCheckedSharedItems(listId) {
  await sbFetch('DELETE', `shopping_list_items?list_id=eq.${listId}&checked=eq.true`, null);
  return { status: 'Success' };
}

async function updateSharedListItemText(itemId, text) {
  await sbFetch('PATCH', `shopping_list_items?id=eq.${itemId}`, { text });
  return { status: 'Success' };
}

// Get distinct recipes contributing to a shared list
async function getSharedListRecipes(listId) {
  const data = await sbFetch('GET', 'shopping_list_items', null,
    `list_id=eq.${listId}&recipe_id=not.is.null&select=recipe_id,recipe_title`);
  if (!data) return [];
  const seen = new Set();
  return data.filter(d => {
    if (!d.recipe_id || seen.has(d.recipe_id)) return false;
    seen.add(d.recipe_id);
    return true;
  });
}
