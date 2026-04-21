// ═══ UI INTERACTION MODULE ═══

/**
 * Opens a modal with an animation.
 * @param {string} id - The ID of the modal element.
 */
function openModalAnimated(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'flex';
  el.classList.add('active');
  // Push history state so back gesture closes the modal
  if (!history.state || history.state.modal !== id) {
    history.pushState({ modal: id }, '');
  }
}

/**
 * Closes a modal with an animation.
 * @param {string} id - The ID of the modal element.
 * @param {function} [cb] - Optional callback function to run after closing.
 */
function closeModalAnimated(id, cb) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('active');
  setTimeout(() => {
    el.style.display = 'none';
    if (id === 'messagingModal' && typeof clearMsgPoll === 'function') clearMsgPoll();
    if (cb) cb();
  }, 130);
}
