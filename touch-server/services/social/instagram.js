const axios = require('axios');

async function publish(post, auth) {
  // auth: { igUserId, accessToken }
  const { igUserId, accessToken } = auth;
  if (!igUserId || !accessToken) throw new Error('missing instagram auth');

  // For images: use image_url parameter. For video: follow video upload flow.
  // Simplified: publish first image URL as single-media post
  const imageUrl = post.media && post.media[0];
  const createResp = await axios.post(`https://graph.facebook.com/${igUserId}/media`, null, {
    params: { image_url: imageUrl, caption: post.body_text, access_token: accessToken }
  });
  const containerId = createResp.data.id;

  const publishResp = await axios.post(`https://graph.facebook.com/${igUserId}/media_publish`, null, {
    params: { creation_id: containerId, access_token: accessToken }
  });

  return publishResp.data; // contains id
}

module.exports = { publish };
