// DayPostsPanel.jsx
import React, { useState } from "react";
import axios from "axios";

export default function DayPostsPanel({ date, posts = [], onApproved = () => {} }) {
  const [loadingIds, setLoadingIds] = useState([]);

  const approvePost = async (id) => {
    const token = localStorage.getItem("token");
    setLoadingIds((s) => [...s, id]);
    try {
      await axios.put(`http://localhost:3000/api/posts/${id}/approve`, {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      onApproved();
    } catch (err) {
      console.error("approve error", err);
      alert("Approve failed: " + (err.response?.data?.error || err.message));
    } finally {
      setLoadingIds((s) => s.filter((x) => x !== id));
    }
  };

  return (
    <div className="p-3 border rounded bg-white h-full overflow-auto">
      <h4 className="font-semibold mb-2 text-black">Scheduled posts for {date.toDateString()}</h4>

      {posts.length === 0 && <div className="text-sm text-gray-500">No posts scheduled for this date.</div>}

      <div className="space-y-3 mt-2">
        {posts.map((p) => (
          <div key={p._id} className="p-3 border rounded bg-gray-50">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium text-black">{p.body_text?.slice(0, 120) || "(no text)"}</div>
                <div className="text-xs text-gray-500 mt-1">Platforms: {p.platforms?.join(", ") || "None"}</div>
                <div className="text-xs text-gray-400 mt-1">Status: {p.status}</div>
                <div className="text-xs text-gray-400 mt-1">Scheduled: {p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : "—"}</div>
              </div>
              <div className="flex flex-col gap-2 items-end">
                {p.status === "draft" && (
                  <button
                    onClick={() => approvePost(p._id)}
                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                    disabled={loadingIds.includes(p._id)}
                  >
                    {loadingIds.includes(p._id) ? "Approving..." : "Approve"}
                  </button>
                )}
                {p.status !== "draft" && <div className="text-xs text-green-600 font-semibold"> {p.status}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
