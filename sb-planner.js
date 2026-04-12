// ============================================================
// ROLL COOKBOOK — sb-planner.js
// Planner entries, meal plan templates, meal prep
// ============================================================

// ── PLANNER ENTRIES ────────────────────────────────────────────

async function addPlannerEntry(username, date, recipeId, mealType, customTitle) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  const entry = { user_id: userId, entry_date: date, meal_type: mealType };
  if (recipeId) entry.recipe_id = recipeId;
  if (customTitle) entry.custom_title = customTitle;
  await sbFetch('POST', 'planner_entries', entry);
  return { status: 'Success' };
}

async function removePlannerEntry(entryId) {
  await sbFetch('DELETE', `planner_entries?id=eq.${entryId}`, null);
  return { status: 'Success' };
}

async function getPlannerRange(username, startDate, endDate) {
  const userId = await getUserId(username);
  if (!userId) return [];
  const entries = await sbFetch('GET', 'planner_entries', null,
    `user_id=eq.${userId}&entry_date=gte.${startDate}&entry_date=lte.${endDate}&select=id,entry_date,recipe_id,meal_type,custom_title&order=entry_date.asc`);
  if (!entries || entries.length === 0) return [];
  const recipeIds = [...new Set(entries.map(e => e.recipe_id).filter(Boolean))];
  let recipesMap = {};
  if (recipeIds.length > 0) {
    const recipes = await sbFetch('GET', 'recipes', null,
      `id=in.(${recipeIds.join(',')})&select=id,title,image_url,cook_time,prep_time,category,ingredients`);
    (recipes || []).forEach(r => { recipesMap[r.id] = r; });
  }
  return entries.map(e => ({ ...e, date: e.entry_date, recipes: recipesMap[e.recipe_id] || null, custom_title: e.custom_title || null }));
}

// Legacy compat
async function getWeekPlan(username, weekOf) {
  return { status: 'Success', days: { Mon:{}, Tue:{}, Wed:{}, Thu:{}, Fri:{}, Sat:{}, Sun:{} } };
}
async function saveWeekPlan(username, weekOf, days) { return { status: 'Success' }; }
async function getPlannerWeek(username, weekStart) { return []; }

// ── MEAL PLAN TEMPLATES ────────────────────────────────────────

async function getMealPlanTemplates(username) {
  const userId = await getUserId(username);
  if (!userId) return [];
  const data = await sbFetch('GET', 'meal_plan_templates', null,
    `user_id=eq.${userId}&select=*&order=created_at.desc`);
  return data || [];
}

async function saveMealPlanTemplate(username, name, entries, autoApply) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  // entries = [{dayIndex:0, mealType:'Dinner', recipeId:'...', recipeTitle:'...', recipeImage:'...'}]
  const existing = await sbFetch('GET', 'meal_plan_templates', null,
    `user_id=eq.${userId}&name=eq.${encodeURIComponent(name)}&select=id`);
  if (existing && existing.length > 0) {
    await sbFetch('PATCH', `meal_plan_templates?id=eq.${existing[0].id}`,
      { entries: JSON.stringify(entries), auto_apply: autoApply || false });
  } else {
    await sbFetch('POST', 'meal_plan_templates', {
      user_id: userId, name, entries: JSON.stringify(entries), auto_apply: autoApply || false
    });
  }
  return { status: 'Success' };
}

async function deleteMealPlanTemplate(templateId) {
  await sbFetch('DELETE', `meal_plan_templates?id=eq.${templateId}`, null);
  return { status: 'Success' };
}

async function updateTemplateAutoApply(templateId, autoApply) {
  await sbFetch('PATCH', `meal_plan_templates?id=eq.${templateId}`, { auto_apply: autoApply });
  return { status: 'Success' };
}

// ── SHARED TEMPLATES MARKETPLACE ─────────────────────────────

async function publishTemplateToMarketplace(templateId) {
  const data = await sbFetch('GET', 'meal_plan_templates', null, `id=eq.${templateId}&select=*`);
  if (!data || !data[0]) return { status: 'Error', message: 'Template not found' };
  const t = data[0];
  const entries = typeof t.entries === 'string' ? JSON.parse(t.entries) : t.entries;
  await sbFetch('POST', 'shared_templates', {
    owner_username: t.user_id,
    name: t.name,
    entries: JSON.stringify(entries),
    is_public: true,
    downloads_count: 0
  });
  return { status: 'Success' };
}

async function getPublicTemplates() {
  const data = await sbFetch('GET', 'shared_templates', null,
    'is_public=eq.true&select=*&order=downloads_count.desc,created_at.desc');
  return data || [];
}

async function downloadPublicTemplate(templateId) {
  const data = await sbFetch('GET', 'shared_templates', null, `id=eq.${templateId}&select=*`);
  if (!data || !data[0]) return { status: 'Error', message: 'Template not found' };
  const t = data[0];
  const entries = typeof t.entries === 'string' ? JSON.parse(t.entries) : t.entries;
  // Save to user's personal templates
  await saveMealPlanTemplate(currentUser, t.name, entries, false);
  // Increment download count
  await sbFetch('PATCH', `shared_templates?id=eq.${templateId}`, { downloads_count: (t.downloads_count || 0) + 1 });
  return { status: 'Success', name: t.name };
}

async function deleteSharedTemplate(templateId) {
  await sbFetch('DELETE', `shared_templates?id=eq.${templateId}`, null);
  return { status: 'Success' };
}

// ── MEAL PREP ──────────────────────────────────────────────────

async function getMealPrepItems(username) {
  const userId = await getUserId(username);
  if (!userId) return [];
  const items = await sbFetch('GET', 'meal_prep', null,
    `user_id=eq.${userId}&select=id,recipe_id,scale,total_servings,servings_used,prep_date,notes,created_at&order=created_at.desc`);
  if (!items || items.length === 0) return [];
  const recipeIds = [...new Set(items.map(e => e.recipe_id).filter(Boolean))];
  let recipesMap = {};
  if (recipeIds.length > 0) {
    const recipes = await sbFetch('GET', 'recipes', null,
      `id=in.(${recipeIds.join(',')})&select=id,title,image_url,ingredients,instructions,servings,cook_time,prep_time`);
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
