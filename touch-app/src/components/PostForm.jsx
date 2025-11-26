import React, { useState } from "react";
import axios from "axios";

function PostForm({ onSave }) {
  const [form, setForm] = useState({
    platforms: [],
    body_text: "",
    media: [],
    first_comment: "",
    scheduled_at: "",
    mediaFiles: [],
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    console.log(form);
  };

  const handleCheckbox = (platform) => {
    setForm((prev) => {
      const platforms = prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform];
      return { ...prev, platforms };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const token = localStorage.getItem("token");
    const uploadedIds = [];

    if (form.mediaFiles?.length) {
      for (const f of form.mediaFiles) {
        const fd = new FormData();
        fd.append("file", f);

        const res = await axios.post(
          "http://localhost:3000/api/posts/upload-media",
          fd,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        uploadedIds.push(res.data.mediaId);
      }
    }

    const payload = {
      ...form,
      media: [...(form.media || []), ...uploadedIds], // array of ObjectIds
    };

    await fetch("http://localhost:3000/api/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []).slice(0, 4); // limit count client-side
    setForm((p) => ({ ...p, mediaFiles: files }));
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded">
      <textarea
        name="body_text"
        placeholder="Post text"
        value={form.body_text}
        onChange={handleChange}
        className="w-full p-2 border mb-2"
      />
      <input
        type="datetime-local"
        name="scheduled_at"
        value={form.scheduled_at}
        onChange={handleChange}
        className="w-full p-2 border mb-2"
      />
      <div>
        {["facebook", "instagram", "linkedin", "tiktok"].map((platform) => (
          <label key={platform} className="mr-4">
            <input
              type="checkbox"
              checked={form.platforms.includes(platform)}
              onChange={() => handleCheckbox(platform)}
            />
            {platform}
          </label>
        ))}
      </div>
      <div className="mt-2">
        <label className="block mb-1">
          Attach images (jpg/png/webp, max{" "}
          {parseInt(import.meta.env.REACT_APP_LINKEDIN_IMAGE_MAX_MB || "5")}MB)
        </label>
        <input
          type="file"
          name="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
        />
      </div>
      <button type="submit" className="bg-blue-500 text-white px-4 py-2 mt-2">
        Save Post
      </button>
    </form>
  );
}

export default PostForm;
