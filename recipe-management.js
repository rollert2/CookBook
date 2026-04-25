// ═══ RECIPE MANAGEMENT MODULE ═══

/**
 * Gets the collection name for a recipe ID.
 * @param {string} recipeId 
 * @returns {string|null}
 */
function getRecipeCollection(recipeId) {
  if (typeof userCollections === 'undefined') return null;
  for (const col of userCollections) { if (col.recipeIds.includes(recipeId)) return col.name; }
  return null;
}

/**
 * Renders the recipe list in the main container.
 */
function renderRecipes() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  let displayRecipes = allRecipes;
  if (window._filteredRecipeIndices && allergyFilterEnabled) {
    displayRecipes = allRecipes.filter((r, i) => window._filteredRecipeIndices[i]);
  }
  let list = displayRecipes.filter(r => {
    const catMatch = activeCategories.has('All') || activeCategories.has(r.category);
    const favMatch = !showFavsOnly || r.favourite;
    const searchMatch = !q || (r.title||'').toLowerCase().includes(q) || (r.category||'').toLowerCase().includes(q) || (r.ingredients||'').toLowerCase().includes(q) || (r.tags||'').toLowerCase().includes(q);
    const timeMatch = !cookTimeFilter || parseCookMinutes(r.cookTime) <= cookTimeFilter;
    const tagMatch = !activeTagFilter || (r.tags||'').toLowerCase().includes(activeTagFilter.toLowerCase());
    return catMatch && favMatch && searchMatch && timeMatch && tagMatch;
  });
  list = sortRecipes(list);
  filteredRecipes = list;
  const container = document.getElementById('recipeContainer');
  if (list.length === 0 && allRecipes.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🍽️</div><p>No recipes yet! Add your first one.</p></div>';
    return;
  }
  if (list.length === 0) { container.innerHTML = '<div class="empty-state"><div class="empty-icon">🍽️</div><p>No recipes found.</p></div>'; return; }
  let cards = list.map((r, i) => {
    const hasImg = r.image && r.image.trim();
    const globalIdx = allRecipes.indexOf(r);
    const colName = getRecipeCollection(r.id);
    const favHtml = r.favourite ? '<div class="fav-badge">⭐</div>' : '';
    const cookBadge = r.cookCount && r.cookCount > 0 ? '<div style="position:absolute;top:6px;right:6px;z-index:3;background:rgba(0,0,0,0.65);color:#fff;border-radius:10px;padding:2px 8px;font-size:0.62em;font-weight:700;backdrop-filter:blur(4px);">🍳 ' + r.cookCount + 'x</div>' : '';
    const diffBadge = r.difficulty ? '<span class="card-difficulty ' + r.difficulty + '" style="font-size:0.6em;padding:2px 6px;border-radius:6px;font-weight:700;position:absolute;bottom:8px;right:10px;z-index:2;">' + (r.difficultyLabel || r.difficulty.charAt(0).toUpperCase() + r.difficulty.slice(1)) + '</span>' : '';
    const imgContent = hasImg
      ? '<img src="' + r.image + '" loading="lazy" onload="this.classList.remove(\'loading\')" class="loading"><div class="card-img-gradient"></div><div class="card-category-overlay">' + r.category + '</div>' + diffBadge
      : '<div class="card-placeholder">' + r.title.charAt(0) + '</div>' + diffBadge;
    const timeHtml = r.cookTime && r.cookTime.length < 30 ? '<span class="card-time">⏱ ' + r.cookTime + '</span>' : '';
    const ratingHtml = r.rating ? '<span class="card-rating">★ ' + r.rating + '</span>' : '';
    const colHtml = colName ? '<span class="card-collection">📁 ' + colName + '</span>' : '';
    const metaHtml = hasImg ? '' : '<div style="font-size:0.6em;color:var(--gold);text-transform:uppercase;font-weight:700;letter-spacing:0.8px;margin-bottom:2px;">' + r.category + '</div>';
    return '<div class="glass-card" data-idx="' + globalIdx + '" onclick="handleCardClick(' + globalIdx + ')" ontouchstart="startLongPress(event,' + globalIdx + ')" ontouchend="cancelLongPress()" ontouchmove="cancelLongPress()" oncontextmenu="showContextMenu(event,' + globalIdx + ');return false;" style="animation-delay:' + (i*0.025) + 's;position:relative;">' + favHtml + cookBadge + '<div class="card-img-wrap">' + imgContent + '</div><div class="card-info">' + metaHtml + '<div class="card-title">' + r.title + '</div><div class="card-footer">' + timeHtml + ratingHtml + colHtml + '</div></div></div>';
  });
  // Add "empty slot" add card if fewer than 6 recipes and no search/filter active
  if (allRecipes.length < 6 && activeCategories.has('All') && !showFavsOnly && !q) {
    cards.push('<div class="glass-card add-slot-card" style="border:2px dashed var(--glass-border);background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px 12px;min-height:160px;cursor:default;">' +
      '<div style="font-size:0.75em;font-weight:700;color:var(--text-faint);text-align:center;margin-bottom:4px;">Add a recipe</div>' +
      '<button onclick="switchTab(\'discover\')" style="width:100%;padding:10px;background:var(--glass);border:1px solid var(--glass-border);border-radius:var(--radius-sm);color:var(--text-dim);font-size:0.8em;font-weight:600;cursor:pointer;font-family:inherit;">🔎 Discover</button>' +
      '<button onclick="openAddModal();switchSyncTab(\'manual\')" style="width:100%;padding:10px;background:var(--glass);border:1px solid var(--glass-border);border-radius:var(--radius-sm);color:var(--text-dim);font-size:0.8em;font-weight:600;cursor:pointer;font-family:inherit;">✏️ Create Recipe</button>' +
      '</div>');
  }
  container.innerHTML = cards.join('');
  // Apply batch selection styling if in batch mode
  if (batchSelectMode) {
    const cardEls = container.querySelectorAll('.glass-card');
    allRecipes.forEach((r, i) => {
      if (cardEls[i] && batchSelectedIds.has(r.id)) cardEls[i].classList.add('batch-selected');
    });
  }
}

/**
 * Handles clicks on recipe cards.
 * @param {number} idx 
 */
function handleCardClick(idx) {
  if (typeof longPressActivated !== 'undefined' && longPressActivated) { longPressActivated = false; return; }
  if (typeof batchSelectMode !== 'undefined' && batchSelectMode) { toggleBatchCard(idx); return; }
  openDetails(idx);
}
