const axios = require('axios');

async function publish(post, auth) {
  // auth: { accessToken, author } where author is e.g. 'urn:li:person:xxxxx' or organization urn
  const { accessToken, author } = auth;
  const API = 'https://api.linkedin.com/v2/ugcPosts';
  const body = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: post.body_text },
        shareMediaCategory: 'NONE'
      }
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
  };
  const res = await axios.post(API, body, { headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version':'2.0.0' }});
  return res.data;
}

module.exports = { publish };
