// PostForm.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";

function PostForm({ onSave, initialScheduledAt = "" }) {
  const [form, setForm] = useState({
    platforms: [],
    body_text: "",
    media: [],
    first_comment: "",
    scheduled_at: initialScheduledAt || "",
    mediaFiles: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialScheduledAt) {
      setForm((p) => ({ ...p, scheduled_at: initialScheduledAt }));
    }
  }, [initialScheduledAt]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleCheckbox = (platform) => {
    setForm((prev) => {
      const platforms = prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform];
      return { ...prev, platforms };
    });
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []).slice(0, 4);
    setForm((p) => ({ ...p, mediaFiles: files }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const uploadedIds = [];

      // Upload each file (backend returns mediaId)
      if (form.mediaFiles?.length) {
        for (const f of form.mediaFiles) {
          const fd = new FormData();
          fd.append("file", f);
          const res = await axios.post("http://localhost:3000/api/posts/upload-media", fd, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          // backend returns { mediaId }
          uploadedIds.push(res.data.mediaId || res.data.id || res.data._id);
        }
      }

      const payload = {
        platforms: form.platforms,
        body_text: form.body_text,
        media: [...(form.media || []), ...uploadedIds],
        first_comment: form.first_comment,
        scheduled_at: form.scheduled_at || null,
      };

      const createRes = await axios.post("http://localhost:3000/api/posts", payload, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const saved = createRes.data;
      if (onSave) onSave(saved);
      // clear some fields but keep scheduled_at so user can add multiple posts same day
      setForm((p) => ({ ...p, body_text: "", mediaFiles: [], media: [], first_comment: "" }));
    } catch (err) {
      console.error("save post error", err);
      setError(err.response?.data?.error || err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded bg-gray-50 text-black">
      {error && <div className="text-sm text-red-600 mb-2 ">{error}</div>}

      <textarea
        name="body_text"
        placeholder="Write your post..."
        value={form.body_text}
        onChange={handleChange}
        className="w-full p-2 border rounded mb-2 resize-y text-black"
        rows={4}
      />

      <input
        type="datetime-local"
        name="scheduled_at"
        value={form.scheduled_at}
        onChange={handleChange}
        className="w-full p-2 border rounded mb-2"
      />

      <div className="flex items-center gap-3 mb-2 text-black">
        {["facebook", "instagram", "linkedin", "tiktok"].map((platform) => (
          <label key={platform} className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.platforms.includes(platform)}
              onChange={() => handleCheckbox(platform)}
              className="w-4 h-4"
            />
            <span className="capitalize">{platform}</span>
          </label>
        ))}
      </div>

      <div className="mb-3">
        <label className="block mb-1 text-sm">Attach images (jpg/png/webp, max 5MB each)</label>
        <input className="hover:cursor-pointer" type="file" accept="image/*" multiple onChange={handleFileChange} />
        <div className="mt-2 text-xs text-gray-500 ">
          {form.mediaFiles.length > 0 && form.mediaFiles.map((f) => <div key={f.name}>{f.name}</div>)}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Post"}
        </button>
      </div>
    </form>
  );
}

export default PostForm;
