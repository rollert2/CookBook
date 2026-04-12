// ============================================================
// ROLL COOKBOOK — sb-recipes.js
// Recipes CRUD, tags, journal entries, last cooked tracking
// ============================================================

async function getRecipes(username) {
  const userId = await getUserId(username);
  if (!userId) return [];
  const data = await sbFetch('GET', 'recipes', null,
    `user_id=eq.${userId}&select=*&order=created_at.desc`);
  return (data || []).map(r => ({
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
    prepTime:     r.prep_time || '',
    servings:     r.servings || '',
    sourceUrl:    r.source_url || '',
    lastCooked:   r.last_cooked_at || '',
    cookCount:    r.cook_count || 0,
    tags:         r.tags || ''
  }));
}

async function addRecipe(username, recipe) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error', message: 'User not found' };
  const existing = await sbFetch('GET', 'recipes', null,
    `user_id=eq.${userId}&title=ilike.${encodeURIComponent(recipe.title)}&select=id`);
  if (existing && existing.length > 0)
    return { status: 'Error', message: `"${recipe.title}" is already in your cookbook.` };
  await sbFetch('POST', 'recipes', {
    user_id:      userId,
    title:        recipe.title,
    category:     recipe.category || 'General',
    ingredients:  recipe.ingredients || '',
    instructions: recipe.instructions || '',
    notes:        recipe.notes || '',
    image_url:    recipe.image_url || recipe.image || '',
    cook_time:    recipe.cookTime || recipe.cook_time || '',
    prep_time:    recipe.prepTime || recipe.prep_time || '',
    servings:     recipe.servings || '',
    source_url:   recipe.source_url || recipe.sourceUrl || '',
    tags:         recipe.tags || '',
    favourite:    false,
    rating:       null
  });
  return { status: 'Success', message: `"${recipe.title}" added to your cookbook!` };
}

async function updateRecipe(recipeId, updates) {
  const mapped = {
    title:        updates.title,
    category:     updates.category,
    ingredients:  updates.ingredients,
    instructions: updates.instructions,
    notes:        updates.notes,
    image_url:    updates.image || updates.image_url,
    cook_time:    updates.cookTime || updates.cook_time,
    prep_time:    updates.prepTime || updates.prep_time,
    servings:     updates.servings,
    source_url:   updates.sourceUrl || updates.source_url,
    tags:         updates.tags
  };
  Object.keys(mapped).forEach(k => mapped[k] === undefined && delete mapped[k]);
  await sbFetch('PATCH', `recipes?id=eq.${recipeId}`, mapped);
  return { status: 'Success' };
}

async function deleteRecipe(recipeId) {
  await sbFetch('DELETE', `recipes?id=eq.${recipeId}`, null);
  return { status: 'Success' };
}

async function toggleFavourite(recipeId, username) {
  const data = await sbFetch('GET', 'recipes', null, `id=eq.${recipeId}&select=favourite`);
  if (!data || !data[0]) return { status: 'Error' };
  const newFav = !data[0].favourite;
  await sbFetch('PATCH', `recipes?id=eq.${recipeId}`, { favourite: newFav });
  return { status: 'Success', favourite: newFav };
}

async function setRating(recipeId, rating) {
  await sbFetch('PATCH', `recipes?id=eq.${recipeId}`,
    { rating: rating ? parseInt(rating) : null });
  return { status: 'Success' };
}

// ── LAST COOKED ────────────────────────────────────────────────

async function markRecipeCooked(recipeId, username) {
  const now = new Date().toISOString();
  // Get current cook count
  const data = await sbFetch('GET', 'recipes', null, `id=eq.${recipeId}&select=cook_count`);
  const count = (data && data[0] ? data[0].cook_count : 0) || 0;
  await sbFetch('PATCH', `recipes?id=eq.${recipeId}`, {
    last_cooked_at: now,
    cook_count: count + 1
  });
  // Log activity feed
  const userId = await getUserId(username);
  const recipe = await sbFetch('GET', 'recipes', null, `id=eq.${recipeId}&select=title,image_url`);
  if (userId && recipe && recipe[0]) {
    await sbFetch('POST', 'activity_feed', {
      actor_username: username,
      action_type: 'cooked',
      recipe_id: recipeId,
      recipe_title: recipe[0].title,
      recipe_image: recipe[0].image_url || ''
    }).catch(() => {});
  }
  return { status: 'Success', cookedAt: now };
}

// ── JOURNAL ENTRIES ────────────────────────────────────────────

async function getJournalEntries(recipeId, username) {
  const userId = await getUserId(username);
  if (!userId) return [];
  const data = await sbFetch('GET', 'recipe_journal', null,
    `recipe_id=eq.${recipeId}&user_id=eq.${userId}&select=*&order=created_at.desc`);
  return data || [];
}

async function addJournalEntry(recipeId, username, content) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  await sbFetch('POST', 'recipe_journal', { recipe_id: recipeId, user_id: userId, content });
  return { status: 'Success' };
}

async function updateJournalEntry(entryId, content) {
  await sbFetch('PATCH', `recipe_journal?id=eq.${entryId}`,
    { content, updated_at: new Date().toISOString() });
  return { status: 'Success' };
}

async function deleteJournalEntry(entryId) {
  await sbFetch('DELETE', `recipe_journal?id=eq.${entryId}`, null);
  return { status: 'Success' };
}

// ── IMAGE UPLOAD ───────────────────────────────────────────────

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
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': mimeString, 'x-upsert': 'true'
      },
      body: blob
    });
    if (!res.ok) throw new Error('Upload failed');
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/recipe-images/${path}`;
    await sbFetch('PATCH', `recipes?id=eq.${recipeId}`, { image_url: publicUrl });
    return { status: 'Success', url: publicUrl };
  } catch(e) { return { status: 'Error', message: e.message }; }
}

// ── SCRAPE ─────────────────────────────────────────────────────

async function scrapeRecipeWithAI(url, username) {
  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, username })
    });
    return await res.json();
  } catch(e) {
    return { status: 'Error', message: 'URL import unavailable. Please use manual entry.' };
  }
}

// ── EXPORT / IMPORT ────────────────────────────────────────────

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
    if (res.status === 'Success') added++; else skipped++;
  }
  return { status: 'Success', message: `Added ${added} recipes.${skipped > 0 ? ' ' + skipped + ' skipped (duplicates).' : ''}` };
}

async function syncNewRecipe(jsonInput, username) {
  let item;
  try { item = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput; }
  catch(e) { return { status: 'Error', message: 'Invalid JSON' }; }
  return await addRecipe(username, item);
}

// ── FRIEND RATINGS ─────────────────────────────────────────────

async function setFriendRating(recipeId, raterUsername, rating) {
  const raterId = await getUserId(raterUsername);
  if (!raterId) return { status: 'Error' };
  const existing = await sbFetch('GET', 'friend_ratings', null,
    `recipe_id=eq.${recipeId}&rater_user_id=eq.${raterId}&select=id`);
  if (existing && existing.length > 0) {
    await sbFetch('PATCH', `friend_ratings?id=eq.${existing[0].id}`, { rating });
  } else {
    await sbFetch('POST', 'friend_ratings', { recipe_id: recipeId, rater_user_id: raterId, rating });
  }
  const recipeData = await sbFetch('GET', 'recipes', null, `id=eq.${recipeId}&select=user_id,title`);
  if (recipeData && recipeData[0] && recipeData[0].user_id !== raterId) {
    await sbFetch('POST', 'notifications', {
      to_user_id: recipeData[0].user_id, from_user_id: raterId,
      type: 'friend_rating',
      meta: JSON.stringify({ recipe_id: recipeId, recipe_title: recipeData[0].title, rating })
    });
  }
  return { status: 'Success' };
}

async function getFriendRatings(recipeId, username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', ratings: [], average: null };
  const follows = await sbFetch('GET', 'follows', null, `follower_id=eq.${userId}&select=followee_id`);
  if (!follows || follows.length === 0) return { status: 'Success', ratings: [], average: null };
  const followeeIds = follows.map(f => f.followee_id);
  const data = await sbFetch('GET', 'friend_ratings', null,
    `recipe_id=eq.${recipeId}&rater_user_id=in.(${followeeIds.join(',')})&select=rating,rater_user_id,users!friend_ratings_rater_user_id_fkey(username,avatar_url)`);
  if (!data || data.length === 0) return { status: 'Success', ratings: [], average: null };
  const ratings = data.map(d => ({ username: d.users.username, avatarUrl: d.users.avatar_url, rating: d.rating }));
  const average = Math.round(ratings.reduce((s, r) => s + r.rating, 0) / ratings.length * 10) / 10;
  return { status: 'Success', ratings, average };
}

// ── RECIPE SHARES ──────────────────────────────────────────────

async function createShareLink(recipeId, username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  const existing = await sbFetch('GET', 'recipe_shares', null,
    `recipe_id=eq.${recipeId}&user_id=eq.${userId}&select=id`);
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
  const data = await sbFetch('GET', 'recipe_shares', null,
    `recipe_id=eq.${recipeId}&user_id=eq.${userId}&select=active`);
  return data && data[0] ? { active: data[0].active } : { active: false };
}

async function setShareActive(recipeId, username, active) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  const existing = await sbFetch('GET', 'recipe_shares', null,
    `recipe_id=eq.${recipeId}&user_id=eq.${userId}&select=id`);
  if (existing && existing.length > 0) {
    await sbFetch('PATCH', `recipe_shares?id=eq.${existing[0].id}`, { active });
  } else if (active) {
    await sbFetch('POST', 'recipe_shares', { recipe_id: recipeId, user_id: userId, active: true });
  }
  return { status: 'Success' };
}

async function addRecipeFromPublicLink(recipeId, username) {
  const recipes = await sbFetch('GET', 'recipes', null, `id=eq.${recipeId}&select=*`);
  if (!recipes || recipes.length === 0) return { status: 'Error', message: 'Recipe not found' };
  const r = recipes[0];
  return await addRecipe(username, {
    title: r.title, category: r.category, ingredients: r.ingredients,
    instructions: r.instructions, notes: r.notes, cook_time: r.cook_time,
    prep_time: r.prep_time, servings: r.servings, image_url: r.image_url
  });
}

// ── ROTD ───────────────────────────────────────────────────────

async function getOrSetRotd(username) {
  const userId = await getUserId(username);
  if (!userId) return null;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const adminRes = await getAdminSettings();
    const s = adminRes.settings || {};
    const todayEST = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    if (s.rotd_override_id && s.rotd_override_date) {
      if (s.rotd_override_date < todayEST) {
        // Override has expired — clear it
        await updateAdminSettings({ rotd_override_id: null, rotd_override_date: null }).catch(() => {});
      } else if (s.rotd_override_date === todayEST) {
        const r = await sbFetch('GET', 'recipes', null, `id=eq.${s.rotd_override_id}&select=*`);
        if (r && r[0]) return r[0];
      }
    }
  } catch(e) {}
  try {
    const settings = await sbFetch('GET', 'user_settings', null,
      `user_id=eq.${userId}&select=rotd_recipe_id,rotd_date`);
    if (settings && settings[0] && settings[0].rotd_date === today && settings[0].rotd_recipe_id) {
      const r = await sbFetch('GET', 'recipes', null, `id=eq.${settings[0].rotd_recipe_id}&select=*`);
      if (r && r[0]) return r[0];
    }
  } catch(e) {}
  const recipes = await sbFetch('GET', 'recipes', null, `user_id=eq.${userId}&select=*`);
  if (!recipes || recipes.length === 0) return null;
  const seed = today.split('-').reduce((a, b) => a + parseInt(b), 0);
  const pick = recipes[seed % recipes.length];
  try {
    await sbFetch('PATCH', `user_settings?user_id=eq.${userId}`,
      { rotd_recipe_id: pick.id, rotd_date: today });
  } catch(e) {}
  return pick;
}

// ── COLLECTIONS ────────────────────────────────────────────────

async function getCollections(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', collections: [] };
  const cols = await sbFetch('GET', 'collections', null,
    `user_id=eq.${userId}&select=id,name,description,cover_image,is_public,collection_recipes(recipe_id)`);
  return {
    status: 'Success',
    collections: (cols || []).map(c => ({
      id: c.id, name: c.name,
      description: c.description || '',
      coverImage: c.cover_image || '',
      isPublic: c.is_public || false,
      recipeIds: (c.collection_recipes || []).map(r => r.recipe_id)
    }))
  };
}

async function createCollection(username, name) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  await sbFetch('POST', 'collections', { user_id: userId, name });
  return { status: 'Success' };
}

async function createCollectionWithVisibility(username, name, isPublic) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  await sbFetch('POST', 'collections', { user_id: userId, name, is_public: isPublic || false });
  return { status: 'Success' };
}

async function updateCollection(collectionId, updates) {
  const allowed = {};
  if (updates.name !== undefined) allowed.name = updates.name;
  if (updates.description !== undefined) allowed.description = updates.description;
  if (updates.coverImage !== undefined) allowed.cover_image = updates.coverImage;
  if (updates.isPublic !== undefined) allowed.is_public = updates.isPublic;
  await sbFetch('PATCH', `collections?id=eq.${collectionId}`, allowed);
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

async function getPublicCollections(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', collections: [] };
  const cols = await sbFetch('GET', 'collections', null,
    `user_id=eq.${userId}&is_public=eq.true&select=id,name,description,cover_image,collection_recipes(recipe_id)`);
  return {
    status: 'Success',
    collections: (cols || []).map(c => ({
      id: c.id, name: c.name,
      description: c.description || '',
      coverImage: c.cover_image || '',
      recipeIds: (c.collection_recipes || []).map(r => r.recipe_id)
    }))
  };
}

async function getFriendCollectionRecipes(collectionId) {
  const data = await sbFetch('GET', 'collection_recipes', null,
    `collection_id=eq.${collectionId}&select=recipe_id,recipes(id,title,category,ingredients,instructions,notes,cook_time,prep_time,image_url,servings)`);
  const recipes = (data || []).map(r => r.recipes).filter(Boolean);
  return { status: 'Success', recipes };
}

// ── BLACKLIST ──────────────────────────────────────────────────

async function getBlacklist() {
  const data = await sbFetch('GET', 'blacklist', null, 'select=domain');
  return { status: 'Success', domains: (data || []).map(r => r.domain) };
}

async function addToBlacklist(domain, username) {
  try { await sbFetch('POST', 'blacklist', { domain: domain.toLowerCase(), blocked_by: username }); }
  catch(e) {}
  return { status: 'Success' };
}

// ── FEATURED ───────────────────────────────────────────────────

async function getFeatured() {
  const data = await sbFetch('GET', 'featured', null, 'select=*&order=created_at.desc');
  return {
    status: 'Success',
    recipes: (data || []).map(r => ({ ...r.recipe_data, featuredId: r.id, featuredAt: r.created_at })),
    total: (data || []).length
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

// ── NUTRITION LOGGING ────────────────────────────────────────

async function logNutritionEntry(username, entryData) {
  // entryData = { recipe_id, recipe_title, log_date, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, servings }
  await sbFetch('POST', 'nutrition_logs', {
    username,
    recipe_id: entryData.recipe_id || null,
    recipe_title: entryData.recipe_title || null,
    log_date: entryData.log_date || new Date().toISOString().slice(0, 10),
    calories: entryData.calories || 0,
    protein_g: entryData.protein_g || 0,
    carbs_g: entryData.carbs_g || 0,
    fat_g: entryData.fat_g || 0,
    fiber_g: entryData.fiber_g || 0,
    sodium_mg: entryData.sodium_mg || 0,
    servings: entryData.servings || 1
  });
  return { status: 'Success' };
}

async function getNutritionHistory(username, daysBack) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (daysBack || 7));
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const data = await sbFetch('GET', 'nutrition_logs', null,
    `username=eq.${username}&log_date=gte.${cutoffStr}&select=*&order=log_date.desc`);
  return data || [];
}

async function getNutritionSummary(username, daysBack) {
  const entries = await getNutritionHistory(username, daysBack);
  if (!entries || entries.length === 0) return { status: 'Success', count: 0, averages: null, dailyData: [] };

  const valid = entries.filter(e => e.calories && !isNaN(Number(e.calories)));
  if (valid.length === 0) return { status: 'Success', count: 0, averages: null, dailyData: [] };

  const avg = (key) => {
    const sum = valid.reduce((s, e) => s + Number(e[key] || 0), 0);
    return Math.round(sum / valid.length * 10) / 10;
  };

  // Group by date for daily chart
  const dailyMap = {};
  valid.forEach(e => {
    const d = e.log_date;
    if (!dailyMap[d]) dailyMap[d] = { date: d, calories: 0, count: 0, protein: 0, carbs: 0, fat: 0 };
    dailyMap[d].calories += Number(e.calories || 0);
    dailyMap[d].protein += Number(e.protein_g || 0);
    dailyMap[d].carbs += Number(e.carbs_g || 0);
    dailyMap[d].fat += Number(e.fat_g || 0);
    dailyMap[d].count += 1;
  });

  const dailyData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  return {
    status: 'Success',
    count: valid.length,
    averages: {
      calories: avg('calories'),
      protein_g: avg('protein_g'),
      carbs_g: avg('carbs_g'),
      fat_g: avg('fat_g'),
      fiber_g: avg('fiber_g'),
      sodium_mg: avg('sodium_mg')
    },
    dailyData,
    totalCalories: Math.round(valid.reduce((s, e) => s + Number(e.calories || 0), 0))
  };
}
