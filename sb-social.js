// ============================================================
// ROLL COOKBOOK — sb-social.js
// Follows, notifications, messaging, activity feed, follow requests
// ============================================================

// ── FOLLOWS ────────────────────────────────────────────────────

async function getFriends(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', following: [], mutuals: [] };
  const [following, followers] = await Promise.all([
    sbFetch('GET', 'follows', null,
      `follower_id=eq.${userId}&select=followee_id,users!follows_followee_id_fkey(username)`),
    sbFetch('GET', 'follows', null,
      `followee_id=eq.${userId}&select=follower_id,users!follows_follower_id_fkey(username)`)
  ]);
  const followingNames = (following || []).map(r => r.users?.username).filter(Boolean);
  const followerNames = (followers || []).map(r => r.users?.username).filter(Boolean);
  const mutuals = followingNames.filter(n => followerNames.includes(n));
  return { status: 'Success', following: followingNames, followers: followerNames, mutuals };
}

async function isMutualFollow(username, otherUsername) {
  const userId = await getUserId(username);
  const otherId = await getUserId(otherUsername);
  if (!userId || !otherId) return false;
  const [fwd, bwd] = await Promise.all([
    sbFetch('GET', 'follows', null, `follower_id=eq.${userId}&followee_id=eq.${otherId}&select=id`),
    sbFetch('GET', 'follows', null, `follower_id=eq.${otherId}&followee_id=eq.${userId}&select=id`)
  ]);
  return fwd && fwd.length > 0 && bwd && bwd.length > 0;
}

async function followUser(followerUsername, followeeUsername) {
  const followerId = await getUserId(followerUsername);
  const followeeId = await getUserId(followeeUsername);
  if (!followerId || !followeeId) return { status: 'Error', message: 'User not found' };

  // Check if target account is private
  const targetUser = await sbFetch('GET', 'users', null,
    `id=eq.${followeeId}&select=is_private`);
  const isPrivate = targetUser && targetUser[0] && targetUser[0].is_private;

  if (isPrivate) {
    // Send follow request instead
    return await sendFollowRequest(followerUsername, followeeUsername);
  }

  try {
    await sbFetch('POST', 'follows', { follower_id: followerId, followee_id: followeeId });
  } catch(e) {
    return { status: 'Error', message: e.message };
  }
  return { status: 'Success' };
}

async function unfollowUser(followerUsername, followeeUsername) {
  const followerId = await getUserId(followerUsername);
  const followeeId = await getUserId(followeeUsername);
  if (!followerId || !followeeId) return { status: 'Error' };
  await sbFetch('DELETE',
    `follows?follower_id=eq.${followerId}&followee_id=eq.${followeeId}`, null);
  return { status: 'Success' };
}

async function getFriendRecipes(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', recipes: [] };
  const data = await sbFetch('GET', 'recipes', null,
    `user_id=eq.${userId}&select=*&order=created_at.desc`);
  return {
    status: 'Success',
    recipes: (data || []).map(r => ({
      id: r.id, category: r.category, title: r.title,
      ingredients: r.ingredients, instructions: r.instructions,
      notes: r.notes, image: r.image_url, cookTime: r.cook_time, rating: r.rating
    }))
  };
}

// ── FOLLOW REQUESTS (private accounts) ────────────────────────

async function sendFollowRequest(requesterUsername, targetUsername) {
  // Check not already following or requested
  const existing = await sbFetch('GET', 'follow_requests', null,
    `requester_username=eq.${requesterUsername}&target_username=eq.${targetUsername}&select=id`)
    .catch(() => []);
  if (existing && existing.length > 0) return { status: 'Success', requested: true };
  await sbFetch('POST', 'follow_requests',
    { requester_username: requesterUsername, target_username: targetUsername });
  // Notify target
  const fromId = await getUserId(requesterUsername);
  const toId = await getUserId(targetUsername);
  if (fromId && toId) {
    await sbFetch('POST', 'notifications', {
      to_user_id: toId, from_user_id: fromId, type: 'follow_request',
      meta: JSON.stringify({ requester: requesterUsername })
    });
  }
  return { status: 'Success', requested: true };
}

async function respondFollowRequest(requesterUsername, targetUsername, accept) {
  if (accept) {
    const followerId = await getUserId(requesterUsername);
    const followeeId = await getUserId(targetUsername);
    if (followerId && followeeId) {
      await sbFetch('POST', 'follows', { follower_id: followerId, followee_id: followeeId })
        .catch(() => {});
    }
  }
  await sbFetch('DELETE',
    `follow_requests?requester_username=eq.${requesterUsername}&target_username=eq.${targetUsername}`,
    null);
  return { status: 'Success' };
}

async function getPendingFollowRequests(username) {
  const data = await sbFetch('GET', 'follow_requests', null,
    `target_username=eq.${username}&select=*&order=created_at.desc`);
  return data || [];
}

// ── NOTIFICATIONS ──────────────────────────────────────────────

async function getNotifications(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', notifications: [] };
  const data = await sbFetch('GET', 'notifications', null,
    `to_user_id=eq.${userId}&seen=eq.false&select=id,type,from_user_id,meta,created_at,users!notifications_from_user_id_fkey(username)&order=created_at.desc`);
  return {
    status: 'Success',
    notifications: (data || []).map(n => ({
      notifId: n.id,
      fromUser: n.users?.username,
      type: n.type,
      meta: n.meta ? JSON.parse(n.meta) : {},
      createdAt: n.created_at
    }))
  };
}

async function dismissNotification(notifId) {
  await sbFetch('PATCH', `notifications?id=eq.${notifId}`, { seen: true });
  return { status: 'Success' };
}

async function sendFollowNotification(fromUsername, toUsername) {
  const fromId = await getUserId(fromUsername);
  const toId = await getUserId(toUsername);
  if (!fromId || !toId) return;
  const mutual = await sbFetch('GET', 'follows', null,
    `follower_id=eq.${toId}&followee_id=eq.${fromId}&select=follower_id`);
  if (mutual && mutual.length > 0) return;
  await sbFetch('POST', 'notifications',
    { to_user_id: toId, from_user_id: fromId, type: 'follow' });
}

async function sendFollowBackNotification(fromUsername, toUsername) {
  const fromId = await getUserId(fromUsername);
  const toId = await getUserId(toUsername);
  if (!fromId || !toId) return;
  await sbFetch('POST', 'notifications',
    { to_user_id: toId, from_user_id: fromId, type: 'follow_back' });
}

// ── ACTIVITY FEED ──────────────────────────────────────────────

async function getActivityFeed(username) {
  // Get who this user follows
  const userId = await getUserId(username);
  if (!userId) return [];
  const follows = await sbFetch('GET', 'follows', null,
    `follower_id=eq.${userId}&select=users!follows_followee_id_fkey(username)`);
  if (!follows || follows.length === 0) return [];
  const followingNames = follows.map(f => f.users?.username).filter(Boolean);
  if (followingNames.length === 0) return [];
  const data = await sbFetch('GET', 'activity_feed', null,
    `actor_username=in.(${followingNames.join(',')})&select=*&order=created_at.desc&limit=40`);
  return data || [];
}

async function logActivityFeed(username, actionType, recipeId, recipeTitle, recipeImage, communityPostId) {
  await sbFetch('POST', 'activity_feed', {
    actor_username: username,
    action_type: actionType,
    recipe_id: recipeId || null,
    recipe_title: recipeTitle || null,
    recipe_image: recipeImage || null,
    community_post_id: communityPostId || null
  }).catch(() => {});
}

// ── INBOX / SHARING ────────────────────────────────────────────

async function sendRecipe(fromUsername, toUsername, recipeData) {
  const fromId = await getUserId(fromUsername);
  const toId = await getUserId(toUsername);
  if (!fromId || !toId) return { status: 'Error', message: 'User not found' };
  await sbFetch('POST', 'inbox', {
    from_user_id: fromId, to_user_id: toId,
    recipe_data: recipeData, status: 'pending'
  });
  return { status: 'Success', message: `Recipe sent to ${toUsername}!` };
}

async function getInbox(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', items: [] };
  const data = await sbFetch('GET', 'inbox', null,
    `to_user_id=eq.${userId}&status=eq.pending&select=*,users!inbox_from_user_id_fkey(username)&order=created_at.desc`);
  return {
    status: 'Success',
    items: (data || []).map(i => ({
      shareId: i.id, fromUser: i.users?.username, recipeData: i.recipe_data
    }))
  };
}

async function respondToShare(shareId, username, accept) {
  if (accept) {
    const data = await sbFetch('GET', 'inbox', null, `id=eq.${shareId}&select=recipe_data`);
    if (data && data[0]) await addRecipe(username, data[0].recipe_data);
  }
  await sbFetch('PATCH', `inbox?id=eq.${shareId}`,
    { status: accept ? 'accepted' : 'declined' });
  return { status: 'Success' };
}

// ── MESSAGING ──────────────────────────────────────────────────

async function getConversations(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', conversations: [] };
  const data = await sbFetch('GET', 'messages', null,
    `or=(from_user_id.eq.${userId},to_user_id.eq.${userId})&status=neq.declined&select=*,from_user:users!messages_from_user_id_fkey(username,avatar_url),to_user:users!messages_to_user_id_fkey(username,avatar_url)&order=created_at.desc`);
  const convMap = {};
  (data || []).forEach(msg => {
    const partner = msg.from_user.username === username ? msg.to_user.username : msg.from_user.username;
    const partnerAvatar = msg.from_user.username === username ? msg.to_user.avatar_url : msg.from_user.avatar_url;
    if (!convMap[partner]) convMap[partner] = { partner, partnerAvatar, messages: [], unread: 0, lastMsg: null, status: msg.status };
    convMap[partner].messages.push(msg);
    if (!convMap[partner].lastMsg) convMap[partner].lastMsg = msg;
    if (msg.to_user.username === username && msg.status === 'delivered') convMap[partner].unread++;
  });
  return { status: 'Success', conversations: Object.values(convMap) };
}

async function getMessages(username, partnerUsername) {
  const userId = await getUserId(username);
  const partnerId = await getUserId(partnerUsername);
  if (!userId || !partnerId) return { status: 'Success', messages: [] };
  const data = await sbFetch('GET', 'messages', null,
    `or=(and(from_user_id.eq.${userId},to_user_id.eq.${partnerId}),and(from_user_id.eq.${partnerId},to_user_id.eq.${userId}))&status=neq.declined&order=created_at.asc&select=*`);
  const unreadIds = (data || []).filter(m => m.to_user_id === userId && m.status === 'delivered').map(m => m.id);
  if (unreadIds.length > 0) {
    await sbFetch('PATCH', `messages?id=in.(${unreadIds.join(',')})`, { status: 'read' });
  }
  return { status: 'Success', messages: data || [] };
}

async function sendMessage(fromUsername, toUsername, content) {
  const fromId = await getUserId(fromUsername);
  const toId = await getUserId(toUsername);
  if (!fromId || !toId) return { status: 'Error', message: 'User not found' };
  const blocked = await sbFetch('GET', 'blocked_users', null,
    `or=(and(blocker_id.eq.${toId},blocked_id.eq.${fromId}),and(blocker_id.eq.${fromId},blocked_id.eq.${toId}))&select=id`);
  if (blocked && blocked.length > 0) return { status: 'Error', message: 'Cannot send message' };
  const mutualFollow = await sbFetch('GET', 'follows', null,
    `follower_id=eq.${toId}&followee_id=eq.${fromId}&select=follower_id`);
  const status = (mutualFollow && mutualFollow.length > 0) ? 'delivered' : 'pending';
  await sbFetch('POST', 'messages', { from_user_id: fromId, to_user_id: toId, content, status });
  return { status: 'Success', messageStatus: status };
}

async function respondToMessage(messageId, accept) {
  await sbFetch('PATCH', `messages?id=eq.${messageId}`,
    { status: accept ? 'delivered' : 'declined' });
  return { status: 'Success' };
}

async function getMessageRequests(username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Success', requests: [] };
  const data = await sbFetch('GET', 'messages', null,
    `to_user_id=eq.${userId}&status=eq.pending&select=*,from_user:users!messages_from_user_id_fkey(username,avatar_url)&order=created_at.desc`);
  return { status: 'Success', requests: data || [] };
}

async function blockUser(blockerUsername, blockedUsername) {
  const blockerId = await getUserId(blockerUsername);
  const blockedId = await getUserId(blockedUsername);
  if (!blockerId || !blockedId) return { status: 'Error' };
  try { await sbFetch('POST', 'blocked_users', { blocker_id: blockerId, blocked_id: blockedId }); }
  catch(e) {}
  return { status: 'Success' };
}

async function getUnreadMessageCount(username) {
  const userId = await getUserId(username);
  if (!userId) return 0;
  const data = await sbFetch('GET', 'messages', null,
    `to_user_id=eq.${userId}&status=eq.delivered&select=id`);
  return (data || []).length;
}
