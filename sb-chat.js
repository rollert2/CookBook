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

async function sendChatMessage(roomId, username, message, imageUrl) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error', message: 'User not found' };
  await sbFetch('POST', 'chat_messages', {
    room_id: roomId, user_id: userId, username, message, image_url: imageUrl || null
  });
  return { status: 'Success' };
}

async function uploadChatPhoto(base64Data, username) {
  try {
    const parts = base64Data.split(',');
    const byteString = atob(parts[1]);
    const mimeString = parts[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeString });
    const ext = (mimeString.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `chat/${username}/${Date.now()}.${ext}`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/recipe-images/${path}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': mimeString, 'x-upsert': 'true'
      },
      body: blob
    });
    if (!res.ok) throw new Error('Upload failed');
    return { status: 'Success', url: `${SUPABASE_URL}/storage/v1/object/public/recipe-images/${path}` };
  } catch(e) { return { status: 'Error', message: e.message }; }
}

async function removeChatMessage(messageId, removedBy) {
  await sbFetch('PATCH', `chat_messages?id=eq.${messageId}`, {
    removed_by: removedBy, message: '', image_url: null
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

async function updateChatRoom(roomId, updates) {
  await sbFetch('PATCH', `chat_rooms?id=eq.${roomId}`, updates);
  return { status: 'Success' };
}

async function addChatRoomMember(roomId, username) {
  const room = await sbFetch('GET', 'chat_rooms', null, `id=eq.${roomId}&select=members`);
  const members = (room && room[0] && room[0].members) || [];
  if (!members.includes(username)) {
    members.push(username);
    await sbFetch('PATCH', `chat_rooms?id=eq.${roomId}`, { members });
  }
  return { status: 'Success' };
}

async function removeChatRoomMember(roomId, username) {
  const room = await sbFetch('GET', 'chat_rooms', null, `id=eq.${roomId}&select=members`);
  const members = ((room && room[0] && room[0].members) || []).filter(m => m !== username);
  await sbFetch('PATCH', `chat_rooms?id=eq.${roomId}`, { members });
  return { status: 'Success' };
}
