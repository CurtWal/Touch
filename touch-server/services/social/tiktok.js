// stub — real flow requires multi-step upload & app registration per TikTok docs
async function publish(post, auth) {
  throw new Error('tiktok publish adapter: implement per TikTok content posting API (see docs)');
}
module.exports = { publish };
