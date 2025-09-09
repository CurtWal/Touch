import React, { useState } from "react";

function PostForm({ onSave }) {
  const [form, setForm] = useState({
    platforms: [],
    body_text: "",
    media: [],
    first_comment: "",
    scheduled_at: ""
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
    const res = await fetch("http://localhost:3000/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await res.json();
    onSave(data);
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
      <button type="submit" className="bg-blue-500 text-white px-4 py-2 mt-2">
        Save Post
      </button>
    </form>
  );
}

export default PostForm;
