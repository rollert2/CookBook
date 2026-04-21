// ═══ PROFILE MANAGEMENT MODULE ═══

/**
 * Opens the edit profile modal and populates it with user data.
 */
function openEditProfileModal() {
  console.log('Opening edit profile modal for:', currentUser);
  getUserProfile(currentUser).then(profile => {
    // Load bio
    const bioEl = document.getElementById('editProfileBio');
    if (bioEl && profile) bioEl.value = profile.bio || '';

    // Load private account toggle
    if (typeof setToggle === 'function') {
      setToggle('editProfileTogglePrivateAccount', profile?.is_private === true);
    }

    // Load avatar
    getUserAvatar(currentUser).then(url => {
      const el = document.getElementById('editProfileAvatarPreview');
      if (el) el.innerHTML = url ? '<img src="' + url + '">' : currentUser.charAt(0).toUpperCase();
    });

    // Load achievements
    renderEditProfileAchievements(profile?.displayed_achievements || []);

    openModalAnimated('editProfileModal');
  }).catch(err => {
    console.error('Error opening edit profile modal:', err);
    if (typeof rcAlert === 'function') rcAlert('Error loading profile');
  });
}

/**
 * Renders the achievements grid in the edit profile modal.
 * @param {Array} displayedIds - Array of achievement IDs currently displayed.
 */
async function renderEditProfileAchievements(displayedIds) {
  const grid = document.getElementById('editProfileAchievementsGrid');
  if (!grid) return;

  const userAchievements = await getUserAchievements();
  const unlockedAchievements = userAchievements.filter(ach => ach.unlocked);

  const displayedArray = Array.isArray(displayedIds) ? displayedIds : [];

  if (unlockedAchievements.length === 0) {
    grid.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);">No achievements unlocked yet!</div>';
    return;
  }

  grid.innerHTML = unlockedAchievements.map(ach => {
    const isEnabled = displayedArray.includes(ach.id);
    return '<div class="achievement-item" data-achievement-id="' + ach.id + '" style="padding:8px;background:var(--glass);border:1px solid var(--glass-border);border-radius:10px;text-align:center;position:relative;">' +
      '<div style="font-size:1.5em;">' + ach.icon + '</div>' +
      '<div style="font-size:0.7em;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + ach.title + '</div>' +
      '<div style="position:absolute;top:4px;right:4px;">' +
      '<input type="checkbox" id="achievement-toggle-' + ach.id + '" ' + (isEnabled ? 'checked' : '') + ' style="cursor:pointer;" onchange="toggleAchievementEnabled(\'' + ach.id + '\', this.checked)">' +
      '</div>' +
      '</div>';
  }).join('');
}

/**
 * Toggles the enabled state of an achievement.
 * @param {string} achievementId 
 * @param {boolean} enabled 
 */
function toggleAchievementEnabled(achievementId, enabled) {
  const checkbox = document.getElementById('achievement-toggle-' + achievementId);
  if (checkbox) {
    checkbox.checked = enabled;
  }
}
