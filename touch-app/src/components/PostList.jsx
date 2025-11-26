import React, { useEffect, useState } from "react";
import PostForm from "./PostForm";
import axios from "axios";

function PostList() {
  const [posts, setPosts] = useState([]);

  const fetchPosts = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:3000/api/posts", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json();
    setPosts(data);
  };

  const approvePost = async (id) => {
    const token = localStorage.getItem("token");
    await axios.put(`http://localhost:3000/api/posts/${id}/approve`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    fetchPosts();
  };

  useEffect(() => {
    fetchPosts();
  }, []);
  const handleNewPost = (post) => {
    setPosts((prev) => [post, ...prev]); // add new post to list
  };
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Create a Post</h2>
      <PostForm onSave={handleNewPost} />

      <h2 className="text-2xl font-bold mt-8 mb-4">Scheduled Posts</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.map((post) => (
          <div
            key={post._id}
            className="bg-white shadow-md rounded-lg p-4 border hover:shadow-lg transition-shadow"
          >
            <p className="mb-2 font-medium">{post.body_text}</p>
            <p className="text-sm text-gray-600 mb-1">
              Platforms: {post.platforms.join(", ") || "None"}
            </p>
            <p className="text-sm text-gray-600 mb-1">
              Scheduled for:{" "}
              {post.scheduled_at
                ? new Date(post.scheduled_at).toLocaleString()
                : "Not scheduled"}
            </p>
            <p className="text-sm font-semibold mb-2">Status: {post.status}</p>

            {post.status.toLowerCase() === "draft" && (
              <button
                onClick={() => approvePost(post._id)}
                className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded"
              >
                Approve
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default PostList;
