const axios = require('axios');

async function publish(post, auth) {
  // auth: { pageId, pageAccessToken }
  const { pageId, pageAccessToken } = auth;
  if (!pageId || !pageAccessToken) throw new Error('missing facebook auth');

  // Simple text post (more complex flows for photos/videos exist via /photos or /videos)
  const url = `https://graph.facebook.com/${pageId}/feed`;
  const res = await axios.post(url, null, { params: { message: post.body_text, access_token: pageAccessToken }});
  return res.data;
}

module.exports = { publish };
