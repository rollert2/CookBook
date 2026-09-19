// ============================================================
// ROLL COOKBOOK — sb-chat.js
// Community chatroom (topic rooms + messages)
// ============================================================

async function getChatRooms() {
  const data = await sbFetch('GET', 'chat_rooms', null, 'select=*&order=created_at.asc');
  return data || [];
}

// Returns messages oldest-first (fetches newest N then reverses)
async function getChatMessages(roomId, limit) {
  const n = limit || 50;
  const data = await sbFetch('GET', 'chat_messages', null,
    `room_id=eq.${roomId}&select=*,users!chat_messages_user_id_fkey(username,avatar_url)&order=created_at.desc&limit=${n}`);
  return (data || []).reverse();
}

async function sendChatMessage(roomId, username, message) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error', message: 'User not found' };
  await sbFetch('POST', 'chat_messages', {
    room_id: roomId, user_id: userId, username, message
  });
  return { status: 'Success' };
}

async function createChatRoom(name, emoji, description) {
  await sbFetch('POST', 'chat_rooms', {
    name, emoji: emoji || '💬', description: description || ''
  });
  return { status: 'Success' };
}

async function deleteChatRoom(roomId) {
  await sbFetch('DELETE', `chat_rooms?id=eq.${roomId}`, null);
  return { status: 'Success' };
}
