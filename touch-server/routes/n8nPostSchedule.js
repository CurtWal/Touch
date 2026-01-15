const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const Post = require("../models/Post");
const { schedulePost } = require("../jobs/agendaScheduler");
require("dotenv").config();
const upload = multer(); // memory storage
const mongoose = require("mongoose");
const router = express.Router();
const PlatformAuth = require("../models/PlatformAuthSchema");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { agenda } = require("../jobs/agendaScheduler");
const Media = require("../models/Media");
const FormData = require("form-data");
const OAuth = require("oauth-1.0a");
const crypto = require("crypto");

function createOAuthHeader({
  url,
  method,
  consumerKey,
  consumerSecret,
  token,
  tokenSecret,
}) {
  const oauth = OAuth({
    consumer: { key: consumerKey, secret: consumerSecret },
    signature_method: "HMAC-SHA1",
    hash_function(base, key) {
      return crypto.createHmac("sha1", key).update(base).digest("base64");
    },
  });

  return oauth.toHeader(
    oauth.authorize({ url, method }, { key: token, secret: tokenSecret })
  );
}

async function uploadMediaToTwitter(buffer, mimeType, oauthCreds) {
  const url = "https://upload.twitter.com/1.1/media/upload.json";

  const form = new FormData();
  form.append("media", buffer, {
    contentType: mimeType,
    filename: "upload",
  });
  form.append("media_category", "tweet_image");

  const oauthHeader = createOAuthHeader({
    url,
    method: "POST",
    consumerKey: process.env.X_API_KEY,
    consumerSecret: process.env.X_API_SECRET,
    token: oauthCreds.oauthToken,
    tokenSecret: oauthCreds.oauthTokenSecret,
  });

  const res = await axios.post(url, form, {
    headers: {
      ...oauthHeader,
      ...form.getHeaders(),
    },
  });

  return res.data.media_id_string;
}

//  Legacy upload function (old LinkedIn API) for uploading images
// async function uploadImageToLinkedIn(imageUrl, accessToken, ownerUrn) {
//   const registerRes = await axios.post(
//     "https://api.linkedin.com/v2/assets?action=registerUpload",
//     {
//       registerUploadRequest: {
//         owner: ownerUrn,
//         recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
//         serviceRelationships: [
//           {
//             identifier: "urn:li:userGeneratedContent",
//             relationshipType: "OWNER",
//           },
//         ],
//       },
//     },
//     {
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         "Content-Type": "application/json",
//       },
//     }
//   );

//   const uploadUrl =
//     registerRes.data.value.uploadMechanism[
//       "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
//     ].uploadUrl;

//   // Fetch raw bytes
//   const fileRes = await axios.get(imageUrl, { responseType: "arraybuffer" });

//   // Upload to LinkedIn
//   await axios.put(uploadUrl, fileRes.data, {
//     headers: {
//       Authorization: `Bearer ${accessToken}`,
//       "Content-Type": "image/png",
//       "Content-Length": fileRes.data.length,
//     },
//   });

//   return registerRes.data.value.asset;
// }

async function uploadImageToLinkedIn(imageUrl, accessToken, ownerUrn) {
  // 1️⃣ Initialize the image upload
  const initRes = await axios.post(
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    {
      initializeUploadRequest: {
        owner: ownerUrn,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Linkedin-Version": "202502",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    }
  );

  const { uploadUrl, image: imageUrn } = initRes.data.value;

  // 2️⃣ Fetch the image bytes
  const fileRes = await axios.get(imageUrl, { responseType: "arraybuffer" });

  // 3️⃣ Upload the image
  await axios.put(uploadUrl, fileRes.data, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "image/png", // adjust if JPG/GIF
      "Content-Length": fileRes.data.byteLength,
    },
  });

  // 4️⃣ Return the new Image URN
  return imageUrn; // <-- This is now urn:li:image:xxxx
}

async function getValidTwitterAccessToken(userId) {
  const auth = await PlatformAuth.findOne({ userId, platform: "twitter" });
  if (!auth) throw new Error("Twitter not connected");

  // ✅ Token still valid
  if (auth.expiresAt && auth.expiresAt > new Date()) {
    return auth.credentials.accessToken;
  }

  // 🔐 REQUIRED Basic Auth
  const basicAuth = Buffer.from(
    `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`
  ).toString("base64");

  try {
    const res = await axios.post(
      "https://api.twitter.com/2/oauth2/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: auth.credentials.refreshToken,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
      }
    );

    auth.credentials.accessToken = res.data.access_token;

    if (res.data.refresh_token) {
      auth.credentials.refreshToken = res.data.refresh_token;
    }

    auth.expiresAt = new Date(Date.now() + res.data.expires_in * 1000);
    auth.refreshedAt = new Date();

    await auth.save();

    return auth.credentials.accessToken;
  } catch (err) {
    console.error(
      "Twitter token refresh failed:",
      err.response?.data || err.message
    );
    throw new Error("Twitter OAuth2 refresh failed");
  }
}
async function publishToLinkedIn({ post, userId }) {
  const auth = await PlatformAuth.findOne({ userId, platform: "linkedin" });
  if (!auth) throw new Error("LinkedIn not connected");

  const accessToken = auth.credentials.accessToken;

  // Get or fetch LinkedIn user ID
    let linkedinUserId =
      auth.credentials?.linkedinUserId ||
      auth.credentials?.id ||
      auth.credentials?.profileId ||
      auth.credentials?.linkedinId ||
      null;

    if (!linkedinUserId) {
      try {
        const me = await axios.get("https://api.linkedin.com/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        linkedinUserId = me.data?.sub;
        if (linkedinUserId) {
          await PlatformAuth.updateOne(
            { _id: auth._id },
            { $set: { "credentials.linkedinUserId": linkedinUserId } }
          );
        }
      } catch (err) {
        return res.status(400).json({
          error: "Unable to fetch LinkedIn user ID",
          details: err.response?.data || err.message,
        });
      }
    }

    const ownerUrn = `urn:li:person:${linkedinUserId}`;

    // ---------------------------------------------
    // 1️⃣ UPLOAD EACH IMAGE FROM DATABASE
    // ---------------------------------------------
    let mediaAsset = [];

    if (post.media) {
      const mediaDoc = await Media.findById(post.media);
      if (mediaDoc) {
        const mediaUrl = `http://localhost:3000/api/posts/media/${mediaDoc._id}`;

        try {
          const assetUrn = await uploadImageToLinkedIn(
            mediaUrl,
            accessToken,
            ownerUrn
          );

          mediaAsset.push(assetUrn);
          //payload.content = { media: { id: assetUrn } }; // ✅ correct format
        } catch (err) {
          console.error(
            "Image upload failed:",
            err.response?.data || err.message
          );
        }
      }
    }
    //  legacy code for multiple images -- currently only single image supported
    // if (Array.isArray(post.media) && post.media.length > 0) {
    //   const mediaDocs = await Media.find({ _id: { $in: post.media } });
    //   const mediaUrl = `http://localhost:3000/api/posts/media/${mediaDocs._id}`;
    //     try {
    //       const assetUrn = await uploadImageToLinkedIn(
    //         mediaUrl,
    //         accessToken,
    //         ownerUrn
    //       );

    //       mediaAssets.push({
    //         status: "READY",
    //         description: { text: "" },
    //         media: assetUrn,
    //         title: { text: "" },
    //       });
    //     } catch (err) {
    //       console.error("Image upload failed:", mediaUrl, err.message);
    //     }
    //   // for (const media of mediaDocs) {
    //   //   const mediaUrl = `http://localhost:3000/api/posts/media/${media._id}`;
    //   //   try {
    //   //     const assetUrn = await uploadImageToLinkedIn(
    //   //       mediaUrl,
    //   //       accessToken,
    //   //       ownerUrn
    //   //     );
    //   //     console.log("Uploaded image to LinkedIn, asset URN:", assetUrn);
    //   //     mediaAssets.push({
    //   //       status: "READY",
    //   //       description: { text: "" },
    //   //       media: assetUrn,
    //   //       title: { text: "" },
    //   //     });
    //   //   } catch (err) {
    //   //     console.error("Image upload failed:", mediaUrl, err.message);
    //   //   }
    //   // }
    // }

    // ---------------------------------------------
    // 2️⃣ BUILD LINKEDIN POST BODY
    // ---------------------------------------------
    const payload = {
      author: ownerUrn,
      commentary: post.body_text || "",
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED" },
      lifecycleState: "PUBLISHED",
    };
    if (mediaAsset.length > 0) {
      payload.content = { media: { id: mediaAsset[0] } }; // only first image for now
    }

    // legacy code for old API
    // const shareContent =
    //   mediaAssets.length > 0
    //     ? {
    //         "com.linkedin.ugc.ShareContent": {
    //           shareCommentary: { text: post.body_text },
    //           shareMediaCategory: "IMAGE",
    //           media: mediaAssets,
    //         },
    //       }
    //     : {
    //         "com.linkedin.ugc.ShareContent": {
    //           shareCommentary: { text: post.body_text },
    //           shareMediaCategory: "NONE",
    //         },
    //       };

    // ---------------------------------------------
    // 3️⃣ PUBLISH TO LINKEDIN
    // ---------------------------------------------

    // legacy code for old API old route
    // const linkedinRes = await axios.post(
    //   "https://api.linkedin.com/v2/ugcPosts",
    //   {
    //     author: ownerUrn,
    //     lifecycleState: "PUBLISHED",
    //     specificContent: shareContent,
    //     visibility: {
    //       "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    //     },
    //   },
    //   {
    //     headers: {
    //       Authorization: `Bearer ${accessToken}`,
    //       "X-Restli-Protocol-Version": "2.0.0",
    //       "Content-Type": "application/json",
    //     },
    //   }
    // );
    const linkedinRes = await axios.post(
      "https://api.linkedin.com/rest/posts",
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
          "LinkedIn-Version": "202511",
        },
      }
    );

    // ---------------------------------------------
    // 4️⃣ UPDATE POST STATUS
    // ---------------------------------------------
    post.status = "published";
    post.remoteIds = post.remoteIds || {};
    post.remoteIds.linkedin =
      linkedinRes.data.id || linkedinRes.data || "unknown";
    post.publishedAt = new Date();
    await post.save();

  return {
    platform: "linkedin",
    remoteId: linkedinRes.data.id || "unknown",
    postId: post._id,
  };
}
async function publishToTwitter({ post, userId }) {
  const auth = await PlatformAuth.findOne({ userId, platform: "twitter" });
  if (!auth) throw new Error("Twitter not connected");

  const bearerToken = await getValidTwitterAccessToken(userId);

  const mediaArray = Array.isArray(post.media) ? post.media : [];
  const mediaIds = [];
  
    if (mediaArray.length > 0) {
      // 🔒 OAuth1 REQUIRED ONLY HERE
      if (
        !auth.credentials?.oauthToken ||
        !auth.credentials?.oauthTokenSecret
      ) {
        return res.status(400).json({
          error: "Twitter OAuth1 required for media uploads",
        });
      }

      const oauthCreds = {
        oauthToken: auth.credentials.oauthToken,
        oauthTokenSecret: auth.credentials.oauthTokenSecret,
      };

      const mediaDocs = await Media.find({ _id: { $in: mediaArray } });

      for (const m of mediaDocs) {
        if (!m?.data) continue;

        const mediaId = await uploadMediaToTwitter(
          m.data,
          m.mimeType,
          oauthCreds
        );

        mediaIds.push(mediaId);
      }
    }

    const tweetRes = await axios.post(
      "https://api.twitter.com/2/tweets",
      {
        text: post.body_text.slice(0, 280),
        ...(mediaIds.length > 0 && {
          media: { media_ids: mediaIds },
        }),
      },
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    post.status = "published";
    post.remoteIds = post.remoteIds || {};
    post.remoteIds.twitter = tweetRes.data.data.id;
    post.publishedAt = new Date();
    await post.save();
  return {
    platform: "twitter",
    remoteId: tweetRes.data.data.id,
    postId: post._id,
  };
}

router.get("/api/n8n/pending-posts", async (req, res) => {
  const posts = await Post.find({
    status: "approved",
    scheduled_at: { $lte: new Date() },
  });
  res.json(posts);
});

router.post("/api/n8n/mark-published/:id", async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).send("Post not found");

  post.status = "published";
  post.publishedAt = new Date();
  post.remoteIds = req.body.remoteIds || {};
  await post.save();

  // Schedule delete job in 24 hours
  await agenda.schedule("in 24 hours", "delete-published-post", {
    postId: post._id,
  });

  res.json({ success: true });
});

router.get("/api/n8n/linkedin-token", async (req, res) => {
  const { userId } = req.query; // n8n passes userId

  const doc = await PlatformAuth.findOne({ userId, platform: "linkedin" });
  if (!doc) return res.status(404).json({ error: "Not connected" });

  res.json({
    n8nToken: doc.n8nToken,
  });
});

// n8n → publish LinkedIn post
router.post("/api/n8n/linkedin/publish", async (req, res) => {
  try {
    
    const { postId, userId } = req.body;
    //console.log("n8n LinkedIn publish request:", { postId, userId });

    if (!postId || !userId) {
      return res.status(400).json({ error: "Missing postId or userId" });
    }

    // Load post from DB
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: "Post not found" });

    // Load LinkedIn auth
    const auth = await PlatformAuth.findOne({ userId, platform: "linkedin" });
    if (!auth || !auth.credentials?.accessToken) {
      return res.status(400).json({ error: "LinkedIn not connected" });
    }

    const accessToken = auth.credentials.accessToken;

    // Get or fetch LinkedIn user ID
    let linkedinUserId =
      auth.credentials?.linkedinUserId ||
      auth.credentials?.id ||
      auth.credentials?.profileId ||
      auth.credentials?.linkedinId ||
      null;

    if (!linkedinUserId) {
      try {
        const me = await axios.get("https://api.linkedin.com/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        linkedinUserId = me.data?.sub;
        if (linkedinUserId) {
          await PlatformAuth.updateOne(
            { _id: auth._id },
            { $set: { "credentials.linkedinUserId": linkedinUserId } }
          );
        }
      } catch (err) {
        return res.status(400).json({
          error: "Unable to fetch LinkedIn user ID",
          details: err.response?.data || err.message,
        });
      }
    }

    const ownerUrn = `urn:li:person:${linkedinUserId}`;

    // ---------------------------------------------
    // 1️⃣ UPLOAD EACH IMAGE FROM DATABASE
    // ---------------------------------------------
    let mediaAsset = [];

    if (post.media) {
      const mediaDoc = await Media.findById(post.media);
      if (mediaDoc) {
        const mediaUrl = `http://localhost:3000/api/posts/media/${mediaDoc._id}`;

        try {
          const assetUrn = await uploadImageToLinkedIn(
            mediaUrl,
            accessToken,
            ownerUrn
          );

          mediaAsset.push(assetUrn);
          //payload.content = { media: { id: assetUrn } }; // ✅ correct format
        } catch (err) {
          console.error(
            "Image upload failed:",
            err.response?.data || err.message
          );
        }
      }
    }
    //  legacy code for multiple images -- currently only single image supported
    // if (Array.isArray(post.media) && post.media.length > 0) {
    //   const mediaDocs = await Media.find({ _id: { $in: post.media } });
    //   const mediaUrl = `http://localhost:3000/api/posts/media/${mediaDocs._id}`;
    //     try {
    //       const assetUrn = await uploadImageToLinkedIn(
    //         mediaUrl,
    //         accessToken,
    //         ownerUrn
    //       );

    //       mediaAssets.push({
    //         status: "READY",
    //         description: { text: "" },
    //         media: assetUrn,
    //         title: { text: "" },
    //       });
    //     } catch (err) {
    //       console.error("Image upload failed:", mediaUrl, err.message);
    //     }
    //   // for (const media of mediaDocs) {
    //   //   const mediaUrl = `http://localhost:3000/api/posts/media/${media._id}`;
    //   //   try {
    //   //     const assetUrn = await uploadImageToLinkedIn(
    //   //       mediaUrl,
    //   //       accessToken,
    //   //       ownerUrn
    //   //     );
    //   //     console.log("Uploaded image to LinkedIn, asset URN:", assetUrn);
    //   //     mediaAssets.push({
    //   //       status: "READY",
    //   //       description: { text: "" },
    //   //       media: assetUrn,
    //   //       title: { text: "" },
    //   //     });
    //   //   } catch (err) {
    //   //     console.error("Image upload failed:", mediaUrl, err.message);
    //   //   }
    //   // }
    // }

    // ---------------------------------------------
    // 2️⃣ BUILD LINKEDIN POST BODY
    // ---------------------------------------------
    const payload = {
      author: ownerUrn,
      commentary: post.body_text || "",
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED" },
      lifecycleState: "PUBLISHED",
    };
    if (mediaAsset.length > 0) {
      payload.content = { media: { id: mediaAsset[0] } }; // only first image for now
    }

    // legacy code for old API
    // const shareContent =
    //   mediaAssets.length > 0
    //     ? {
    //         "com.linkedin.ugc.ShareContent": {
    //           shareCommentary: { text: post.body_text },
    //           shareMediaCategory: "IMAGE",
    //           media: mediaAssets,
    //         },
    //       }
    //     : {
    //         "com.linkedin.ugc.ShareContent": {
    //           shareCommentary: { text: post.body_text },
    //           shareMediaCategory: "NONE",
    //         },
    //       };

    // ---------------------------------------------
    // 3️⃣ PUBLISH TO LINKEDIN
    // ---------------------------------------------

    // legacy code for old API old route
    // const linkedinRes = await axios.post(
    //   "https://api.linkedin.com/v2/ugcPosts",
    //   {
    //     author: ownerUrn,
    //     lifecycleState: "PUBLISHED",
    //     specificContent: shareContent,
    //     visibility: {
    //       "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    //     },
    //   },
    //   {
    //     headers: {
    //       Authorization: `Bearer ${accessToken}`,
    //       "X-Restli-Protocol-Version": "2.0.0",
    //       "Content-Type": "application/json",
    //     },
    //   }
    // );
    const linkedinRes = await axios.post(
      "https://api.linkedin.com/rest/posts",
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
          "LinkedIn-Version": "202511",
        },
      }
    );

    // ---------------------------------------------
    // 4️⃣ UPDATE POST STATUS
    // ---------------------------------------------
    post.status = "published";
    post.remoteIds = post.remoteIds || {};
    post.remoteIds.linkedin =
      linkedinRes.data.id || linkedinRes.data || "unknown";
    post.publishedAt = new Date();
    await post.save();

    // ---------------------------------------------
    // 5️⃣ SCHEDULE CLEANUP AFTER 24 HOURS
    // ---------------------------------------------
    await agenda.schedule("in 24 hours", "delete-published-post", {
      postId: post._id,
    });

    return res.json({
      success: true,
      linkedinId: post.remoteIds.linkedin,
      postId: post._id,
    });
  } catch (err) {
    console.error("n8n LinkedIn publish error:", err.response?.data || err);
    return res.status(err.response?.status || 500).json({
      error: "Failed to publish LinkedIn post",
      details: err.response?.data || err.message,
    });
  }
});

router.post("/api/n8n/twitter/publish", async (req, res) => {
  const { postId, userId } = req.body;

  const post = await Post.findById(postId);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const auth = await PlatformAuth.findOne({ userId, platform: "twitter" });
  if (!auth) {
    return res.status(400).json({ error: "Twitter not connected" });
  }

  const bearerToken = await getValidTwitterAccessToken(userId);

  const mediaArray = Array.isArray(post.media) ? post.media : [];
  const mediaIds = [];
  try {
    if (mediaArray.length > 0) {
      // 🔒 OAuth1 REQUIRED ONLY HERE
      if (
        !auth.credentials?.oauthToken ||
        !auth.credentials?.oauthTokenSecret
      ) {
        return res.status(400).json({
          error: "Twitter OAuth1 required for media uploads",
        });
      }

      const oauthCreds = {
        oauthToken: auth.credentials.oauthToken,
        oauthTokenSecret: auth.credentials.oauthTokenSecret,
      };

      const mediaDocs = await Media.find({ _id: { $in: mediaArray } });

      for (const m of mediaDocs) {
        if (!m?.data) continue;

        const mediaId = await uploadMediaToTwitter(
          m.data,
          m.mimeType,
          oauthCreds
        );

        mediaIds.push(mediaId);
      }
    }

    const tweetRes = await axios.post(
      "https://api.twitter.com/2/tweets",
      {
        text: post.body_text.slice(0, 280),
        ...(mediaIds.length > 0 && {
          media: { media_ids: mediaIds },
        }),
      },
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    post.status = "published";
    post.remoteIds = post.remoteIds || {};
    post.remoteIds.twitter = tweetRes.data.data.id;
    post.publishedAt = new Date();
    await post.save();

    res.json({
      success: true,
      twitterId: post.remoteIds.twitter,
      postId: post._id,
    });
  } catch (err) {
    console.error("n8n Twitter publish error:", err.response?.data || err);
    return res.status(err.response?.status || 500).json({
      error: "Failed to publish Twitter post",
      details: err.response?.data || err.message,
    });
  }
});

router.get("/api/n8n/twitter-token", async (req, res) => {
  const { userId } = req.query; // n8n passes userId

  const doc = await PlatformAuth.findOne({ userId, platform: "twitter" });
  if (!doc) return res.status(404).json({ error: "Not connected" });

  res.json({
    n8nToken: doc.n8nToken,
  });
});

router.post("/api/n8n/publish", async (req, res) => {
  const { postId, userId } = req.body;

  if (!postId || !userId) {
    return res.status(400).json({ error: "Missing postId or userId" });
  }

  const post = await Post.findById(postId);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const results = {};
  const errors = {};

  for (const platform of post.platforms) {
    try {
      if (platform === "linkedin") {
        const r = await publishToLinkedIn({ post, userId });
        results.linkedin = r.remoteId;
      }

      if (platform === "twitter") {
        const r = await publishToTwitter({ post, userId });
        results.twitter = r.remoteId;
      }
    } catch (err) {
      console.error(`${platform} publish failed`, err.message);
      errors[platform] = err.message;
    }
  }

  // ✅ If at least one platform succeeded, mark as published
  if (Object.keys(results).length > 0) {
    post.status = "published";
    post.remoteIds = results;
    post.publishedAt = new Date();
    await post.save();

    await agenda.schedule("in 24 hours", "delete-published-post", {
      postId: post._id,
    });
  }

  return res.json({
    success: Object.keys(results).length > 0,
    results,
    errors,
  });
});

module.exports = {
  router,
  publishToLinkedIn,
  publishToTwitter,
};