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

// ── AUTO-POPULATE FROM MEAL PLAN ──────────────────────────────

async function autoPopulateShopFromPlanner(username, weekStart, weekEnd) {
  // Get planner entries for the week
  const entries = await getPlannerRange(username, weekStart, weekEnd);
  if (!entries || entries.length === 0) return { status: 'Error', message: 'No meals planned for this week.', added: 0 };

  // Collect all ingredients from entries with recipes
  const allIngredients = [];
  const recipeTitles = [];
  entries.forEach(e => {
    if (e.recipes && e.recipes.ingredients) {
      const ings = e.recipes.ingredients
        .split(/\n/)
        .map(line => line.replace(/\*+/g, '').trim())
        .filter(Boolean);
      allIngredients.push(...ings.map(ing => ({ text: ing, group: e.recipes.category || 'Other', recipeId: e.recipes.id, recipeTitle: e.recipes.title, autoPopulated: true })));
      recipeTitles.push(e.recipes.title);
    }
  });

  if (allIngredients.length === 0) return { status: 'Error', message: 'No ingredients found in planned meals.', added: 0 };

  // Get current shop items to avoid duplicates
  const currentItems = JSON.parse(localStorage.getItem('shopItems_' + username) || '[]');
  const currentTexts = new Set(currentItems.map(i => i.text.toLowerCase().trim()));

  // Filter out items already in the list
  const newItems = allIngredients.filter(ing => !currentTexts.has(ing.text.toLowerCase().trim()));

  // Add new items to the front of the list
  const updatedShop = [...newItems.map(i => ({ text: i.text, checked: false, group: i.group, recipe_id: i.recipeId, recipe_title: i.recipeTitle, auto_populated: i.autoPopulated })), ...currentItems];

  // Save to localStorage
  localStorage.setItem('shopItems_' + username, JSON.stringify(updatedShop));

  // Sync to Supabase in background
  try {
    await updateUserSettings(username, { shopping_list: JSON.stringify(updatedShop) });
  } catch(e) {}

  return { status: 'Success', added: newItems.length, total: allIngredients.length, recipeTitles: [...new Set(recipeTitles)] };
}
