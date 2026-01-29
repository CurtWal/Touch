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
  data,
}) {
  const oauth = OAuth({
    consumer: { key: consumerKey, secret: consumerSecret },
    signature_method: "HMAC-SHA1",
    hash_function(base, key) {
      return crypto.createHmac("sha1", key).update(base).digest("base64");
    },
  });

  const requestObject = { url, method };
  if (data) {
    requestObject.data = data;
  }

  return oauth.toHeader(
    oauth.authorize(requestObject, { key: token, secret: tokenSecret }),
  );
}

async function uploadMediaToTwitter(buffer, mimeType, oauthCreds) {
  const url = "https://upload.twitter.com/1.1/media/upload.json";

  const form = new FormData();
  form.append("media", buffer, {
    contentType: mimeType,
    filename: "upload",
  });
  form.append("media_category", "TWEET_IMAGE");

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
async function waitForTwitterVideo(mediaId, oauthCreds) {
  const STATUS_URL = "https://upload.twitter.com/1.1/media/upload.json";

  while (true) {
    const statusParams = {
      command: "STATUS",
      media_id: mediaId,
    };

    const oauthHeader = createOAuthHeader({
      url: STATUS_URL,
      method: "GET",
      consumerKey: process.env.X_API_KEY,
      consumerSecret: process.env.X_API_SECRET,
      token: oauthCreds.oauthToken,
      tokenSecret: oauthCreds.oauthTokenSecret,
      data: statusParams, // 🔥 REQUIRED
    });

    const res = await axios.get(STATUS_URL, {
      params: statusParams,
      headers: oauthHeader,
    });

    const info = res.data.processing_info;
    if (!info) break;

    if (info.state === "failed") {
      throw new Error("Twitter video processing failed");
    }

    if (info.state === "succeeded") break;

    await new Promise((r) => setTimeout(r, info.check_after_secs * 1000));
  }
}

async function uploadVideoToTwitter(buffer, mimeType, oauthCreds) {
  const INIT_URL = "https://upload.twitter.com/1.1/media/upload.json";

  try {
    // Validate credentials
    if (!oauthCreds.oauthToken || !oauthCreds.oauthTokenSecret) {
      throw new Error(
        "Missing OAuth 1.0a credentials for Twitter media upload",
      );
    }

    console.log(
      "Twitter OAuth creds present. Token length:",
      oauthCreds.oauthToken?.length,
    );

    // INIT
    console.log("Sending INIT command to Twitter media upload...");
    const initData = {
      command: "INIT",
      media_type: mimeType,
      total_bytes: buffer.length,
      media_category: "TWEET_VIDEO",
    };
    const initRes = await axios.post(
      INIT_URL,
      new URLSearchParams(initData).toString(),
      {
        headers: {
          ...createOAuthHeader({
            url: INIT_URL,
            method: "POST",
            consumerKey: process.env.X_API_KEY,
            consumerSecret: process.env.X_API_SECRET,
            token: oauthCreds.oauthToken,
            tokenSecret: oauthCreds.oauthTokenSecret,
            data: initData,
          }),
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const mediaId = initRes.data.media_id_string;
    console.log("Twitter video INIT complete. Media ID:", mediaId);

    // APPEND (5MB chunks)
    const chunkSize = 5 * 1024 * 1024;
    let segmentIndex = 0;

    for (let i = 0; i < buffer.length; i += chunkSize) {
      const chunk = buffer.slice(i, i + chunkSize);

      // For APPEND, we need to send multipart/form-data
      // The OAuth signature MUST include the form field values
      const appendData = {
        command: "APPEND",
        media_id: String(mediaId),
        segment_index: String(segmentIndex),
      };

      // Calculate OAuth signature with form field data (not binary)
      // ✅ OAuth header WITHOUT body params
      const oauthHeader = createOAuthHeader({
        url: INIT_URL,
        method: "POST",
        consumerKey: process.env.X_API_KEY,
        consumerSecret: process.env.X_API_SECRET,
        token: oauthCreds.oauthToken,
        tokenSecret: oauthCreds.oauthTokenSecret,
      });

      const form = new FormData();
      form.append("command", "APPEND");
      form.append("media_id", String(mediaId));
      form.append("segment_index", String(segmentIndex));
      form.append("media", chunk, { filename: "chunk.bin" });

      try {
        // Send the full FormData (with binary) with the OAuth header that was calculated with form field values
        await axios.post(INIT_URL, form, {
          headers: {
            ...oauthHeader,
            ...form.getHeaders(),
            "Content-Length": form.getLengthSync(),
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 30000,
          transformRequest: [(data) => data],
        });
      } catch (err) {
        console.error(
          `Twitter video APPEND segment ${segmentIndex} failed:`,
          err.message,
        );
        throw new Error(
          `APPEND failed at segment ${segmentIndex}: ${err.message}`,
        );
      }

      console.log(`Twitter video APPEND segment ${segmentIndex} complete`);
      segmentIndex++;
    }

    // FINALIZE
    console.log("Sending FINALIZE command to Twitter media upload...");
    const finalizeData = {
      command: "FINALIZE",
      media_id: mediaId,
    };
    const finalizeRes = await axios.post(
      INIT_URL,
      new URLSearchParams(finalizeData).toString(),
      {
        headers: {
          ...createOAuthHeader({
            url: INIT_URL,
            method: "POST",
            consumerKey: process.env.X_API_KEY,
            consumerSecret: process.env.X_API_SECRET,
            token: oauthCreds.oauthToken,
            tokenSecret: oauthCreds.oauthTokenSecret,
            data: finalizeData,
          }),
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    console.log(
      "Twitter video FINALIZE complete. Processing info:",
      finalizeRes.data.processing_info,
    );
    if (finalizeRes.data.processing_info) {
      await waitForTwitterVideo(mediaId, oauthCreds);
    }

    console.log("Twitter video processing complete. Media ID:", mediaId);
    return mediaId;
  } catch (err) {
    console.error("Twitter video upload error full details:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
      headers: err.config?.headers,
    });
    throw err;
  }
}

async function uploadImageToLinkedIn(buffer, mimeType, accessToken, ownerUrn) {
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
        "LinkedIn-Version": "202502",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    }
  );

  const { uploadUrl, image: imageUrn } = initRes.data.value;

  await axios.put(uploadUrl, buffer, {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": buffer.byteLength,
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  return imageUrn;
}


async function uploadVideoToLinkedIn(buffer, mimeType, accessToken, ownerUrn) {
  try {
    // console.log("Starting LinkedIn video upload for:", videoUrl);
    // const fileRes = await axios.get(videoUrl, {
    //   responseType: "arraybuffer",
    // });

    // console.log("Video file size:", fileRes.data.byteLength, "bytes");
    console.log("Video buffer size:", buffer.byteLength, "bytes");
    const initRes = await axios.post(
      "https://api.linkedin.com/rest/videos?action=initializeUpload",
      {
        initializeUploadRequest: {
          owner: ownerUrn,
          fileSizeBytes: buffer.byteLength, // 🔥 REQUIRED
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": "202502",
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
    );

    const videoUrn = initRes.data.value.video;
    const uploadUrl = initRes.data.value.uploadInstructions?.[0]?.uploadUrl;
    const uploadToken = initRes.data.value.uploadToken;

    console.log("LinkedIn video upload initialized. URN:", videoUrn);
    console.log("Upload URL:", uploadUrl);
    console.log("Upload Token:", uploadToken);
    console.log(
      "Full init response value:",
      JSON.stringify(initRes.data.value, null, 2),
    );

    if (!uploadUrl) {
      throw new Error(
        "No uploadUrl returned from LinkedIn. Response: " +
          JSON.stringify(initRes.data.value),
      );
    }

    try {
      const putRes = await axios.put(uploadUrl, buffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": buffer.byteLength,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60000,
      });

      const etag = putRes.headers.etag;
      console.log("LinkedIn video PUT success:", putRes.status);
      console.log("ETag from response:", etag);

      // Finalize the upload with the ETag from the PUT response
      try {
        await axios.post(
          "https://api.linkedin.com/rest/videos?action=finalizeUpload",
          {
            finalizeUploadRequest: {
              video: videoUrn,
              uploadToken: uploadToken,
              uploadedPartIds: [etag], // Use the ETag from PUT response
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "LinkedIn-Version": "202502",
              "X-Restli-Protocol-Version": "2.0.0",
            },
          }
        );

        console.log("LinkedIn video upload finalized successfully");
      } catch (finalizeErr) {
        console.error("LinkedIn finalize error details:", {
          status: finalizeErr.response?.status,
          message: finalizeErr.response?.data?.message,
        });
        throw finalizeErr;
      }
    } catch (putErr) {
      console.error("LinkedIn video PUT FAILED:", {
        status: putErr.response?.status,
        data: putErr.response?.data,
        message: putErr.message,
      });
      throw putErr;
    }

    console.log("LinkedIn video file uploaded and finalized");

    // Wait for video to finish processing before returning
    await waitForLinkedInVideo(videoUrn, accessToken);

    return videoUrn; // urn:li:video:xxxx
  } catch (err) {
    console.error(
      "LinkedIn video upload error:",
      err.response?.data || err.message,
    );
    throw err;
  }
}
async function waitForLinkedInVideo(videoUrn, accessToken) {
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes max with 5 second intervals

  while (attempts < maxAttempts) {
    try {
      console.log(
        `Checking LinkedIn video status (attempt ${attempts + 1}/${maxAttempts}):`,
        videoUrn,
      );
      const res = await axios.get(
        `https://api.linkedin.com/rest/videos/${encodeURIComponent(videoUrn)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "LinkedIn-Version": "202502",
            "X-Restli-Protocol-Version": "2.0.0",
          },
        },
      );

      console.log("LinkedIn video status response:", res.data);
      const status = res.data?.status || res.data?.processingMetadata?.status;

      if (status === "AVAILABLE") {
        console.log("LinkedIn video is READY");
        return;
      }

      if (status === "FAILED") {
        throw new Error(
          `LinkedIn video processing failed: ${
            res.data?.processingMetadata?.failureReason || "unknown reason"
          }`,
        );
      }

      console.log("LinkedIn video status:", status, "- waiting...");
      attempts++;
      await new Promise((r) => setTimeout(r, 5000));
    } catch (err) {
      console.error(
        `LinkedIn video status check error (attempt ${attempts + 1}):`,
        err.response?.data || err.message,
      );
      if (err.response?.status === 404) {
        throw new Error("LinkedIn video not found - upload may have failed");
      }
      if (attempts < 3) {
        // retry first few times on network errors
        attempts++;
        await new Promise((r) => setTimeout(r, 5000));
      } else {
        throw err;
      }
    }
  }
  throw new Error("LinkedIn video processing timeout after 10 minutes");
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
    `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`,
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
      },
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
      err.response?.data || err.message,
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
          { $set: { "credentials.linkedinUserId": linkedinUserId } },
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
      // const mediaUrl = `http://localhost:3000/api/posts/media/${mediaDoc._id}`;
      const mediaBuffer = mediaDoc.data;

      try {
        let assetUrn;
        // Check if media is video or image
        if (mediaDoc.mimeType?.startsWith("video")) {
          assetUrn = await uploadVideoToLinkedIn(
            mediaBuffer,
            mediaDoc.mimeType,
            accessToken,
            ownerUrn,
          );
        } else {
          assetUrn = await uploadImageToLinkedIn(
            mediaBuffer,
            mediaDoc.mimeType,
            accessToken,
            ownerUrn,
          );
        }

        mediaAsset.push(assetUrn);
        //payload.content = { media: { id: assetUrn } }; // ✅ correct format
      } catch (err) {
        console.error(
          "Media upload failed:",
          err.response?.data || err.message,
        );
        throw err;
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
  // Build final payload with media type detection
  if (mediaAsset.length > 0) {
    const mediaDoc = await Media.findById(post.media);
    const isVideo = mediaDoc?.mimeType?.startsWith("video");

    if (isVideo) {
      // For REST API videos: content.media is an OBJECT with id and title
      payload.content = {
        media: {
          id: mediaAsset[0],
          title: post.body_text?.substring(0, 100) || "Uploaded media",
        },
      };
    } else {
      // For REST API images: content.media is an OBJECT with just id
      payload.content = {
        media: {
          id: mediaAsset[0],
        },
      };
    }
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
    },
  ).catch(err => {
    console.error("LinkedIn publish error details:", {
      status: err.response?.status,
      message: err.response?.data?.message,
      data: JSON.stringify(err.response?.data, null, 2),
      sentPayload: JSON.stringify(payload, null, 2),
    });
    throw err;
  });

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

  const mediaArray = Array.isArray(post.media) ? post.media : [];
  const mediaIds = [];

  if (mediaArray.length > 0) {
    // 🔒 OAuth1 REQUIRED FOR MEDIA UPLOADS
    if (!auth.credentials?.oauthToken || !auth.credentials?.oauthTokenSecret) {
      throw new Error("Twitter OAuth1 required for media uploads");
    }

    const oauthCreds = {
      oauthToken: auth.credentials.oauthToken,
      oauthTokenSecret: auth.credentials.oauthTokenSecret,
    };

    const mediaDocs = await Media.find({ _id: { $in: mediaArray } });

    for (const m of mediaDocs) {
      if (!m?.data) continue;

      let mediaId;
      console.log("Uploading to Twitter. Media type:", m.mimeType);

      if (m.mimeType.startsWith("video")) {
        console.log("Uploading video to Twitter...");
        mediaId = await uploadVideoToTwitter(m.data, m.mimeType, oauthCreds);
      } else {
        console.log("Uploading image to Twitter...");
        mediaId = await uploadMediaToTwitter(m.data, m.mimeType, oauthCreds);
      }

      mediaIds.push(mediaId);
    }
  }

  // Get valid bearer token for Tweet API v2
  const bearerToken = await getValidTwitterAccessToken(userId);

  const tweetRes = await axios.post(
    "https://api.twitter.com/2/tweets",
    {
      text: post.body_text.slice(0, 280),
      ...(mediaIds.length > 0 && { media: { media_ids: mediaIds } }),
    },
    {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
    },
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

// router.get("/api/n8n/pending-posts", async (req, res) => {
//   const posts = await Post.find({
//     status: "approved",
//     scheduled_at: { $lte: new Date() },
//   });
//   res.json(posts);
// });

// router.post("/api/n8n/mark-published/:id", async (req, res) => {
//   const post = await Post.findById(req.params.id);
//   if (!post) return res.status(404).send("Post not found");

//   post.status = "published";
//   post.publishedAt = new Date();
//   post.remoteIds = req.body.remoteIds || {};
//   await post.save();

//   // Schedule delete job in 24 hours
//   await agenda.schedule("in 24 hours", "delete-published-post", {
//     postId: post._id,
//   });

//   res.json({ success: true });
// });

// router.get("/api/n8n/linkedin-token", async (req, res) => {
//   const { userId } = req.query; // n8n passes userId

//   const doc = await PlatformAuth.findOne({ userId, platform: "linkedin" });
//   if (!doc) return res.status(404).json({ error: "Not connected" });

//   res.json({
//     n8nToken: doc.n8nToken,
//   });
// });

// // n8n → publish LinkedIn post
// router.post("/api/n8n/linkedin/publish", async (req, res) => {
//   try {
//     const { postId, userId } = req.body;
//     //console.log("n8n LinkedIn publish request:", { postId, userId });

//     if (!postId || !userId) {
//       return res.status(400).json({ error: "Missing postId or userId" });
//     }

//     // Load post from DB
//     const post = await Post.findById(postId);
//     if (!post) return res.status(404).json({ error: "Post not found" });

//     // Load LinkedIn auth
//     const auth = await PlatformAuth.findOne({ userId, platform: "linkedin" });
//     if (!auth || !auth.credentials?.accessToken) {
//       return res.status(400).json({ error: "LinkedIn not connected" });
//     }

//     const accessToken = auth.credentials.accessToken;

//     // Get or fetch LinkedIn user ID
//     let linkedinUserId =
//       auth.credentials?.linkedinUserId ||
//       auth.credentials?.id ||
//       auth.credentials?.profileId ||
//       auth.credentials?.linkedinId ||
//       null;

//     if (!linkedinUserId) {
//       try {
//         const me = await axios.get("https://api.linkedin.com/v2/userinfo", {
//           headers: { Authorization: `Bearer ${accessToken}` },
//         });

//         linkedinUserId = me.data?.sub;
//         if (linkedinUserId) {
//           await PlatformAuth.updateOne(
//             { _id: auth._id },
//             { $set: { "credentials.linkedinUserId": linkedinUserId } },
//           );
//         }
//       } catch (err) {
//         return res.status(400).json({
//           error: "Unable to fetch LinkedIn user ID",
//           details: err.response?.data || err.message,
//         });
//       }
//     }

//     const ownerUrn = `urn:li:person:${linkedinUserId}`;

//     // ---------------------------------------------
//     // 1️⃣ UPLOAD EACH IMAGE FROM DATABASE
//     // ---------------------------------------------
//     let mediaAsset = [];

//     if (post.media) {
//       const mediaDoc = await Media.findById(post.media);
//       if (mediaDoc) {
//         const mediaUrl = `http://localhost:3000/api/posts/media/${mediaDoc._id}`;

//         try {
//           let assetUrn;

//           if (mediaDoc.mimeType?.startsWith("video")) {
//             assetUrn = await uploadVideoToLinkedIn(
//               mediaUrl,
//               accessToken,
//               ownerUrn,
//             );
//           } else {
//             assetUrn = await uploadImageToLinkedIn(
//               mediaUrl,
//               accessToken,
//               ownerUrn,
//             );
//           }

//           mediaAsset.push(assetUrn);

//           //payload.content = { media: { id: assetUrn } }; // ✅ correct format
//         } catch (err) {
//           console.error(
//             "Image upload failed:",
//             err.response?.data || err.message,
//           );
//         }
//       }
//     }
//     //  legacy code for multiple images -- currently only single image supported
//     // if (Array.isArray(post.media) && post.media.length > 0) {
//     //   const mediaDocs = await Media.find({ _id: { $in: post.media } });
//     //   const mediaUrl = `http://localhost:3000/api/posts/media/${mediaDocs._id}`;
//     //     try {
//     //       const assetUrn = await uploadImageToLinkedIn(
//     //         mediaUrl,
//     //         accessToken,
//     //         ownerUrn
//     //       );

//     //       mediaAssets.push({
//     //         status: "READY",
//     //         description: { text: "" },
//     //         media: assetUrn,
//     //         title: { text: "" },
//     //       });
//     //     } catch (err) {
//     //       console.error("Image upload failed:", mediaUrl, err.message);
//     //     }
//     //   // for (const media of mediaDocs) {
//     //   //   const mediaUrl = `http://localhost:3000/api/posts/media/${media._id}`;
//     //   //   try {
//     //   //     const assetUrn = await uploadImageToLinkedIn(
//     //   //       mediaUrl,
//     //   //       accessToken,
//     //   //       ownerUrn
//     //   //     );
//     //   //     console.log("Uploaded image to LinkedIn, asset URN:", assetUrn);
//     //   //     mediaAssets.push({
//     //   //       status: "READY",
//     //   //       description: { text: "" },
//     //   //       media: assetUrn,
//     //   //       title: { text: "" },
//     //   //     });
//     //   //   } catch (err) {
//     //   //     console.error("Image upload failed:", mediaUrl, err.message);
//     //   //   }
//     //   // }
//     // }

//     // ---------------------------------------------
//     // 2️⃣ BUILD LINKEDIN POST BODY
//     // ---------------------------------------------
//     const payload = {
//       author: ownerUrn,
//       commentary: post.body_text || "",
//       visibility: "PUBLIC",
//       distribution: { feedDistribution: "MAIN_FEED" },
//       lifecycleState: "PUBLISHED",
//     };
//     if (mediaAsset.length > 0) {
//       let mediaType = null;

//       if (post.media) {
//         const mediaDoc = await Media.findById(post.media);
//         if (mediaDoc?.mimeType?.startsWith("video")) {
//           mediaType = "VIDEO";
//         } else {
//           mediaType = "IMAGE";
//         }
//       }

//       if (mediaAsset.length > 0) {
//         payload.content = {
//           mediaCategory: mediaType,
//           media: [
//             {
//               id: mediaAsset[0],
//             },
//           ],
//         };
//       }
//     }

//     // legacy code for old API
//     // const shareContent =
//     //   mediaAssets.length > 0
//     //     ? {
//     //         "com.linkedin.ugc.ShareContent": {
//     //           shareCommentary: { text: post.body_text },
//     //           shareMediaCategory: "IMAGE",
//     //           media: mediaAssets,
//     //         },
//     //       }
//     //     : {
//     //         "com.linkedin.ugc.ShareContent": {
//     //           shareCommentary: { text: post.body_text },
//     //           shareMediaCategory: "NONE",
//     //         },
//     //       };

//     // ---------------------------------------------
//     // 3️⃣ PUBLISH TO LINKEDIN
//     // ---------------------------------------------

//     // legacy code for old API old route
//     // const linkedinRes = await axios.post(
//     //   "https://api.linkedin.com/v2/ugcPosts",
//     //   {
//     //     author: ownerUrn,
//     //     lifecycleState: "PUBLISHED",
//     //     specificContent: shareContent,
//     //     visibility: {
//     //       "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
//     //     },
//     //   },
//     //   {
//     //     headers: {
//     //       Authorization: `Bearer ${accessToken}`,
//     //       "X-Restli-Protocol-Version": "2.0.0",
//     //       "Content-Type": "application/json",
//     //     },
//     //   }
//     // );
//     const linkedinRes = await axios.post(
//       "https://api.linkedin.com/rest/posts",
//       payload,
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//           "Content-Type": "application/json",
//           "X-Restli-Protocol-Version": "2.0.0",
//           "LinkedIn-Version": "202511",
//         },
//       },
//     );

//     // ---------------------------------------------
//     // 4️⃣ UPDATE POST STATUS
//     // ---------------------------------------------
//     post.status = "published";
//     post.remoteIds = post.remoteIds || {};
//     post.remoteIds.linkedin =
//       linkedinRes.data.id || linkedinRes.data || "unknown";
//     post.publishedAt = new Date();
//     await post.save();

//     // ---------------------------------------------
//     // 5️⃣ SCHEDULE CLEANUP AFTER 24 HOURS
//     // ---------------------------------------------
//     await agenda.schedule("in 24 hours", "delete-published-post", {
//       postId: post._id,
//     });

//     return res.json({
//       success: true,
//       linkedinId: post.remoteIds.linkedin,
//       postId: post._id,
//     });
//   } catch (err) {
//     console.error("n8n LinkedIn publish error:", err.response?.data || err);
//     return res.status(err.response?.status || 500).json({
//       error: "Failed to publish LinkedIn post",
//       details: err.response?.data || err.message,
//     });
//   }
// });

// router.post("/api/n8n/twitter/publish", async (req, res) => {
//   const { postId, userId } = req.body;

//   const post = await Post.findById(postId);
//   if (!post) return res.status(404).json({ error: "Post not found" });

//   const auth = await PlatformAuth.findOne({ userId, platform: "twitter" });
//   if (!auth) {
//     return res.status(400).json({ error: "Twitter not connected" });
//   }

//   const bearerToken = await getValidTwitterAccessToken(userId);

//   const mediaArray = Array.isArray(post.media) ? post.media : [];
//   const mediaIds = [];
//   try {
//     if (mediaArray.length > 0) {
//       // 🔒 OAuth1 REQUIRED ONLY HERE
//       if (
//         !auth.credentials?.oauthToken ||
//         !auth.credentials?.oauthTokenSecret
//       ) {
//         return res.status(400).json({
//           error: "Twitter OAuth1 required for media uploads",
//         });
//       }

//       const oauthCreds = {
//         oauthToken: auth.credentials.oauthToken,
//         oauthTokenSecret: auth.credentials.oauthTokenSecret,
//       };

//       const mediaDocs = await Media.find({ _id: { $in: mediaArray } });

//       for (const m of mediaDocs) {
//         if (!m?.data) continue;

//         let mediaId;

//         if (m.mimeType.startsWith("video")) {
//           mediaId = await uploadVideoToTwitter(m.data, m.mimeType, oauthCreds);
//         } else {
//           mediaId = await uploadMediaToTwitter(m.data, m.mimeType, oauthCreds);
//         }

//         mediaIds.push(mediaId);
//       }
//     }

//     const tweetRes = await axios.post(
//       "https://api.twitter.com/2/tweets",
//       {
//         text: post.body_text.slice(0, 280),
//         ...(mediaIds.length > 0 && {
//           media: { media_ids: mediaIds },
//         }),
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${bearerToken}`,
//           "Content-Type": "application/json",
//         },
//       },
//     );

//     post.status = "published";
//     post.remoteIds = post.remoteIds || {};
//     post.remoteIds.twitter = tweetRes.data.data.id;
//     post.publishedAt = new Date();
//     await post.save();

//     res.json({
//       success: true,
//       twitterId: post.remoteIds.twitter,
//       postId: post._id,
//     });
//   } catch (err) {
//     console.error("n8n Twitter publish error:", err.response?.data || err);
//     return res.status(err.response?.status || 500).json({
//       error: "Failed to publish Twitter post",
//       details: err.response?.data || err.message,
//     });
//   }
// });

// router.get("/api/n8n/twitter-token", async (req, res) => {
//   const { userId } = req.query; // n8n passes userId

//   const doc = await PlatformAuth.findOne({ userId, platform: "twitter" });
//   if (!doc) return res.status(404).json({ error: "Not connected" });

//   res.json({
//     n8nToken: doc.n8nToken,
//   });
// });

// router.post("/api/n8n/publish", async (req, res) => {
//   const { postId, userId } = req.body;

//   if (!postId || !userId) {
//     return res.status(400).json({ error: "Missing postId or userId" });
//   }

//   const post = await Post.findById(postId);
//   if (!post) return res.status(404).json({ error: "Post not found" });

//   const results = {};
//   const errors = {};

//   for (const platform of post.platforms) {
//     try {
//       if (platform === "linkedin") {
//         const r = await publishToLinkedIn({ post, userId });
//         results.linkedin = r.remoteId;
//       }

//       if (platform === "twitter") {
//         const r = await publishToTwitter({ post, userId });
//         results.twitter = r.remoteId;
//       }
//     } catch (err) {
//       console.error(`${platform} publish failed`, err.message);
//       errors[platform] = err.message;
//     }
//   }

//   // ✅ If at least one platform succeeded, mark as published
//   if (Object.keys(results).length > 0) {
//     post.status = "published";
//     post.remoteIds = results;
//     post.publishedAt = new Date();
//     await post.save();

//     await agenda.schedule("in 24 hours", "delete-published-post", {
//       postId: post._id,
//     });
//   }

//   return res.json({
//     success: Object.keys(results).length > 0,
//     results,
//     errors,
//   });
// });

// DEBUG: Check OAuth credentials stored for a user
// router.get("/debug/twitter-oauth/:userId", async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const auth = await PlatformAuth.findOne({ userId, platform: "twitter" });
//     if (!auth) {
//       return res.json({ error: "No Twitter auth found", userId });
//     }
//     res.json({
//       userId,
//       hasAccessToken: !!auth.credentials?.accessToken,
//       hasRefreshToken: !!auth.credentials?.refreshToken,
//       hasOAuthToken: !!auth.credentials?.oauthToken,
//       hasOAuthTokenSecret: !!auth.credentials?.oauthTokenSecret,
//       oauthTokenLength: auth.credentials?.oauthToken?.length || 0,
//       oauthTokenSecretLength: auth.credentials?.oauthTokenSecret?.length || 0,
//       expiresAt: auth.expiresAt,
//       credentials: {
//         // Don't expose full tokens, just indicators
//         oauthToken: auth.credentials?.oauthToken
//           ? `${auth.credentials.oauthToken.substring(0, 10)}...`
//           : null,
//         oauthTokenSecret: auth.credentials?.oauthTokenSecret
//           ? `${auth.credentials.oauthTokenSecret.substring(0, 10)}...`
//           : null,
//       },
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

module.exports = {
  router,
  publishToLinkedIn,
  publishToTwitter,
};
