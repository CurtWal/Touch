const express = require("express");
const router = express.Router();
const PlatformAuth = require("../models/PlatformAuthSchema");
const axios = require("axios");
const { verifyToken } = require("./auth");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const OAuth = require("oauth-1.0a");

const oauth = OAuth({
  consumer: {
    key: process.env.X_API_KEY,
    secret: process.env.X_API_SECRET,
  },
  signature_method: "HMAC-SHA1",
  hash_function(base, key) {
    return crypto.createHmac("sha1", key).update(base).digest("base64");
  },
});
function base64url(input) {
  return input
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
// 1) Redirect user to LinkedIn OAuth
router.get("/auth/linkedin", (req, res) => {
  const state = req.query.state; // JWT passed from frontend
  const SCOPES = "openid profile email w_member_social";
  const redirectUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${
    process.env.LINKEDIN_CLIENT_ID
  }&redirect_uri=${encodeURIComponent(
    process.env.LINKEDIN_REDIRECT_URI
  )}&scope=${SCOPES}%20openid%20profile%20email&state=${state}`;

  res.redirect(redirectUrl);
});

// 2) OAuth callback from LinkedIn
router.get("/auth/linkedin/callback", async (req, res) => {
  const { code, state } = req.query;
  const decoded = jwt.verify(state, process.env.JWT_SECRET);
  const userId = decoded.id; // the logged-in user

  try {
    // Exchange code for token
    const tokenRes = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      null,
      {
        params: {
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
          client_id: process.env.LINKEDIN_CLIENT_ID,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        },
      }
    );

    const {
      access_token,
      expires_in,
      refresh_token,
      refresh_token_expires_in,
    } = tokenRes.data;

    // ⚡ Generate dedicated n8n JWT for running scheduled posts
    const n8nToken = jwt.sign(
      { id: userId },
      process.env.JWT_SECRET,
      { expiresIn: "1y" } // long lived
    );
    await PlatformAuth.findOneAndUpdate(
      { userId, platform: "linkedin" },
      {
        $set: {
          credentials: {
            accessToken: access_token,
            refreshToken: refresh_token,
          },
          n8nToken,
          expiresAt: new Date(Date.now() + expires_in * 1000),
          refreshedAt: new Date(),
          notes: "LinkedIn OAuth connected",
        },
      },
      { upsert: true, new: true }
    );

    // Redirect to frontend confirmation page
    res.redirect(
      process.env.FRONTEND_URL + "/social-accounts?linkedin=connected"
    );
  } catch (err) {
    console.error("LinkedIn OAuth error:", err.response?.data || err.message);
    res.status(500).send("LinkedIn OAuth failed");
  }
});

router.post("/auth/linkedin/refresh", verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const doc = await PlatformAuth.findOne({ userId, platform: "linkedin" });
    if (!doc || !doc.credentials.refreshToken) {
      return res.status(400).json({ error: "No LinkedIn refresh token" });
    }

    const refreshToken = doc.credentials.refreshToken;

    const refreshRes = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      null,
      {
        params: {
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: process.env.LINKEDIN_CLIENT_ID,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        },
      }
    );

    const newAccessToken = refreshRes.data.access_token;

    const expiresIn = refreshRes.data.expires_in;

    doc.credentials.accessToken = newAccessToken;
    doc.expiresAt = new Date(Date.now() + expiresIn * 1000);
    doc.refreshedAt = new Date();
    await doc.save();

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error("LinkedIn refresh error:", err.response?.data || err.message);
    res.status(500).send("LinkedIn refresh failed");
  }
});

router.get("/auth/linkedin/token", verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const doc = await PlatformAuth.findOne({ userId, platform: "linkedin" });
    if (!doc) return res.status(404).json({ error: "LinkedIn not connected" });

    // if token expired, refresh it
    if (doc.expiresAt && doc.expiresAt < new Date()) {
      // ideally call your refresh endpoint here
    }

    res.json({ accessToken: doc.credentials.accessToken });
  } catch (err) {
    console.error("LinkedIn token fetch error:", err);
    res.status(500).json({ error: "Failed to fetch token" });
  }
});

router.get("/auth/twitter", async (req, res) => {
  try {
    const { state } = req.query;
    if (!state) return res.status(401).json({ error: "Missing state" });

    // 🔐 Verify JWT from query
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    const userId = decoded.id;

    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(
      crypto.createHash("sha256").update(verifier).digest()
    );

    // Store PKCE verifier
    await PlatformAuth.findOneAndUpdate(
      { userId, platform: "twitter" },
      {
        $set: {
          credentials: {
            pkceVerifier: verifier,
          },
        },
      },
      { upsert: true }
    );

    const url =
      `https://twitter.com/i/oauth2/authorize?` +
      new URLSearchParams({
        response_type: "code",
        client_id: process.env.X_CLIENT_ID,
        redirect_uri: process.env.X_REDIRECT_URI,
        scope: "tweet.read tweet.write users.read offline.access",
        state: userId, // safe internal reference
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

    res.redirect(url);
  } catch (err) {
    console.error("Twitter auth error:", err.message);
    res.redirect(process.env.FRONTEND_URL + "/social-accounts?twitter=error");
  }
});

router.get("/auth/twitter/callback", async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    if (!code || !userId) {
      throw new Error("Missing code or userId");
    }

    const auth = await PlatformAuth.findOne({ userId, platform: "twitter" });
    if (!auth?.credentials?.pkceVerifier) {
      throw new Error("Missing PKCE verifier");
    }

    const verifier = auth.credentials.pkceVerifier;

    const basicAuth = Buffer.from(
      `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`
    ).toString("base64");

    const tokenRes = await axios.post(
      "https://api.twitter.com/2/oauth2/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.X_REDIRECT_URI,
        code_verifier: verifier,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    if (!access_token) {
      throw new Error("Twitter did not return access token");
    }
    const n8nToken = jwt.sign(
      { id: userId },
      process.env.JWT_SECRET,
      { expiresIn: "1y" } // long lived
    );
    await PlatformAuth.findOneAndUpdate(
      { userId, platform: "twitter" },
      {
        $set: {
          credentials: {
            accessToken: access_token,
            refreshToken: refresh_token,
          },
          n8nToken,
          expiresAt: new Date(Date.now() + expires_in * 1000),
          refreshedAt: new Date(),
          notes: "Twitter OAuth connected",
        },
      }
    );

    res.redirect(
      process.env.FRONTEND_URL + "/social-accounts?twitter=connected"
    );
  } catch (err) {
    console.error("Twitter callback error FULL:", err.response?.data || err);

    return res.redirect(
      process.env.FRONTEND_URL + "/social-accounts?twitter=error"
    );
  }
});
router.get("/auth/twitter/oauth1", async (req, res) => {
  const { state } = req.query;
  const decoded = jwt.verify(state, process.env.JWT_SECRET);
  const userId = decoded.id;

  const requestData = {
    url: "https://api.twitter.com/oauth/request_token",
    method: "POST",
    data: {
      oauth_callback: process.env.X_OAUTH1_CALLBACK,
    },
  };

  const authHeader = oauth.toHeader(oauth.authorize(requestData));

  const response = await axios.post(requestData.url, null, {
    headers: {
      ...authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const params = new URLSearchParams(response.data);
  const oauthToken = params.get("oauth_token");
  const oauthTokenSecret = params.get("oauth_token_secret");

  // 🔐 Store temporary secret
  await PlatformAuth.updateOne(
    { userId, platform: "twitter" },
    {
      $set: {
        "credentials.oauthTempSecret": oauthTokenSecret,
      },
    }
  );

  res.redirect(
    `https://api.twitter.com/oauth/authorize?oauth_token=${oauthToken}`
  );
});

router.get("/auth/twitter/oauth1/callback", async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;

  const auth = await PlatformAuth.findOne({
    platform: "twitter",
    "credentials.oauthTempSecret": { $exists: true },
  });
  const tempSecret = auth.credentials.oauthTempSecret;

  const requestData = {
    url: "https://api.twitter.com/oauth/access_token",
    method: "POST",
    data: { oauth_verifier },
  };

  const headers = oauth.toHeader(
    oauth.authorize(requestData, {
      key: oauth_token,
      secret: tempSecret,
    })
  );

  const response = await axios.post(requestData.url, null, { headers });

  const params = new URLSearchParams(response.data);

  await PlatformAuth.updateOne(
    { _id: auth._id },
    {
      $set: {
        "credentials.oauthToken": params.get("oauth_token"),
        "credentials.oauthTokenSecret": params.get("oauth_token_secret"),
      },
      $unset: {
        "credentials.oauthTempSecret": "",
      },
    }
  );

  res.redirect(
    process.env.FRONTEND_URL + "/social-accounts?twitterMedia=connected"
  );
});
module.exports = router;
