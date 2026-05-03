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

/**
 * Parses a recipe's total time (prep + cook) into minutes.
 * @param {object} r - recipe object with cookTime and prepTime string fields
 * @returns {number} Total minutes or Infinity
 */
function parseTotalMinutes(r) {
  let total = 0;
  if (r.cookTime) {
    const h = r.cookTime.match(/(\d+)\s*(h|hr|hour)/i);
    const m = r.cookTime.match(/(\d+)\s*(m|min|minute)/i);
    if (h) total += parseInt(h[1]) * 60;
    if (m) total += parseInt(m[1]);
  }
  if (r.prepTime) {
    const h = r.prepTime.match(/(\d+)\s*(h|hr|hour)/i);
    const m = r.prepTime.match(/(\d+)\s*(m|min|minute)/i);
    if (h) total += parseInt(h[1]) * 60;
    if (m) total += parseInt(m[1]);
  }
  return total || Infinity;
}

const QUICK_COOK_MAX_MINUTES = 20;

let _searchDebounceTimer = null;
/**
 * Debounces the search function.
 */
function debouncedSearch() {
  clearTimeout(_searchDebounceTimer);
  _searchDebounceTimer = setTimeout(renderRecipes, 180);
}
