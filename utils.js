// ═══ UTILITY FUNCTIONS ═══

/**
 * Parses a cook time string (e.g., "30 min", "1 hr") into total minutes.
 * @param {string} cookTime 
 * @returns {number} Total minutes or Infinity if invalid
 */
function parseCookMinutes(cookTime) {
  if (!cookTime) return Infinity;
  const h = cookTime.match(/(\d+)\s*(h|hr|hour)/i);
  const m = cookTime.match(/(\d+)\s*(m|min|minute)/i);
  let total = 0;
  if (h) total += parseInt(h[1]) * 60;
  if (m) total += parseInt(m[1]);
  return total || Infinity;
}

let _searchDebounceTimer = null;
/**
 * Debounces the search function.
 */
function debouncedSearch() {
  clearTimeout(_searchDebounceTimer);
  _searchDebounceTimer = setTimeout(renderRecipes, 180);
}
