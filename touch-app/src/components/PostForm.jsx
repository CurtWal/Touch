import React, { useState, useEffect } from "react";
import axios from "axios";

function PostForm({ onSave, initialScheduledAt = "" }) {
  // Helper: get current time + 30 minutes formatted for datetime-local
  const getDefaultDateTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30); // add 30 mins
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  // datetime-local expects "YYYY-MM-DDTHH:MM"
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

  const [form, setForm] = useState({
    platforms: [],
    body_text: "",
    media: [],
    first_comment: "",
    scheduled_at: initialScheduledAt || "", // will set dynamically below
    mediaFiles: [],
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // On mount: if scheduled_at is empty, set it to current time + 30 mins
 useEffect(() => {
  setForm((p) => ({
    ...p,
    scheduled_at: initialScheduledAt || getDefaultDateTime(),
  }));
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

      if (form.mediaFiles?.length) {
        for (const f of form.mediaFiles) {
          const fd = new FormData();
          fd.append("file", f);
          const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/posts/upload-media`, fd, {
            headers: { Authorization: `Bearer ${token}` },
          });
          uploadedIds.push(res.data.mediaId || res.data.id || res.data._id);
        }
      }

      // Convert datetime-local to UTC ISO string
      let scheduledAtISO = null;
      if (form.scheduled_at) {
        // datetime-local format: "2026-01-29T17:55"
        const [datePart, timePart] = form.scheduled_at.split('T');
        const [year, month, day] = datePart.split('-');
        const [hours, minutes] = timePart.split(':');
        
        // Create local date and convert to UTC
        const tzOffsetMs = new Date().getTimezoneOffset() * 60000;
        const localDate = new Date(year, parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
        const utcDate = new Date(localDate.getTime() - tzOffsetMs);
        scheduledAtISO = utcDate.toISOString();
      }

      const payload = {
        platforms: form.platforms,
        body_text: form.body_text,
        media: [...(form.media || []), ...uploadedIds],
        first_comment: form.first_comment,
        scheduled_at: scheduledAtISO,
      };

      const createRes = await axios.post(`${import.meta.env.VITE_API_URL}/api/posts`, payload, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });

      const saved = createRes.data;
      if (onSave) onSave(saved);

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
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}

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
        {["linkedin", "twitter"].map((platform) => (
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
        <input
          className="hover:cursor-pointer"
          type="file"
          accept="image/*,video/*" 
          multiple
          onChange={handleFileChange}
        />
        <div className="mt-2 text-xs text-gray-500">
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
