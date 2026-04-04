// ============================================================
// ROLL COOKBOOK — sb-community.js
// Community posts, comments, upvotes, photo uploads
// ============================================================

async function getCommunityPosts(category, sortBy, limit, offset) {
  let query = `removed=eq.false&select=*,users!community_posts_user_id_fkey(username,avatar_url)`;
  if (category && category !== 'All') query += `&category=eq.${encodeURIComponent(category)}`;
  query += sortBy === 'top' ? `&order=upvotes.desc,created_at.desc` : `&order=created_at.desc`;
  query += `&limit=${limit || 20}&offset=${offset || 0}`;
  return (await sbFetch('GET', 'community_posts', null, query)) || [];
}

async function createCommunityPost(username, postData) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error', message: 'User not found' };
  const post = await sbFetch('POST', 'community_posts', {
    user_id: userId,
    recipe_id: postData.recipeId || null,
    title: postData.title,
    category: postData.category || 'General',
    image_url: postData.image_url || null,
    attempt_photo_url: postData.attempt_photo_url || null,
    ingredients: postData.ingredients || '',
    instructions: postData.instructions || '',
    notes: postData.notes || '',
    cook_time: postData.cook_time || '',
    servings: postData.servings || ''
  });
  // Log to activity feed
  const postId = post && post[0] ? post[0].id : null;
  if (postId) {
    await logActivityFeed(username, 'community_post',
      postData.recipeId || null, postData.title,
      postData.image_url || null, postId).catch(() => {});
  }
  return { status: 'Success' };
}

async function upvoteCommunityPost(postId, username) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  const [existing, post] = await Promise.all([
    sbFetch('GET', 'community_upvotes', null, `post_id=eq.${postId}&user_id=eq.${userId}&select=id`),
    sbFetch('GET', 'community_posts', null, `id=eq.${postId}&select=upvotes`)
  ]);
  const currentCount = (post && post[0]) ? (post[0].upvotes || 0) : 0;
  if (existing && existing.length > 0) {
    await sbFetch('DELETE', `community_upvotes?post_id=eq.${postId}&user_id=eq.${userId}`, null);
    await sbFetch('PATCH', `community_posts?id=eq.${postId}`,
      { upvotes: Math.max(0, currentCount - 1) });
    return { status: 'Success', action: 'removed' };
  }
  await sbFetch('POST', 'community_upvotes', { post_id: postId, user_id: userId });
  await sbFetch('PATCH', `community_posts?id=eq.${postId}`, { upvotes: currentCount + 1 });
  return { status: 'Success', action: 'added' };
}

async function hasUpvotedPost(postId, username) {
  const userId = await getUserId(username);
  if (!userId) return false;
  const data = await sbFetch('GET', 'community_upvotes', null,
    `post_id=eq.${postId}&user_id=eq.${userId}&select=id`);
  return data && data.length > 0;
}

async function getCommunityComments(postId) {
  const data = await sbFetch('GET', 'community_comments', null,
    `post_id=eq.${postId}&select=*,users!community_comments_user_id_fkey(username,avatar_url)&order=created_at.asc`);
  return data || [];
}

async function addCommunityComment(postId, username, content) {
  const userId = await getUserId(username);
  if (!userId) return { status: 'Error' };
  await sbFetch('POST', 'community_comments', { post_id: postId, user_id: userId, content });
  return { status: 'Success' };
}

async function removeCommunityPost(postId) {
  await sbFetch('PATCH', `community_posts?id=eq.${postId}`, { removed: true });
  return { status: 'Success' };
}

async function uploadCommunityPhoto(base64Data, filename, username) {
  try {
    const parts = base64Data.split(',');
    const byteString = atob(parts[1]);
    const mimeString = parts[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeString });
    const path = `community/${username}_${Date.now()}.jpg`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/recipe-images/${path}`, {
      method: 'PUT',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'image/jpeg', 'x-upsert': 'true'
      },
      body: blob
    });
    if (!res.ok) throw new Error('Upload failed');
    return { status: 'Success', url: `${SUPABASE_URL}/storage/v1/object/public/recipe-images/${path}` };
  } catch(e) { return { status: 'Error', message: e.message }; }
}
