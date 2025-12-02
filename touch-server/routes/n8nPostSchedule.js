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

module.exports = router;
