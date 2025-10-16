import React, { Component } from "react";
import axios from "axios";

function AiChat() {
  const [message, setMessage] = React.useState("");
  const [chatLog, setChatLog] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    try {
      const response = await axios.post(
        "https://touch-six.vercel.app/api/chat",
        { message },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setChatLog((prev) => [
        ...prev,
        { user: message, bot: response.data.reply },
      ]);
      setMessage("");
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div>
      <h3>AI Chat</h3>
      <div
        style={{
          border: "1px solid #ccc",
          padding: "10px",
          height: "300px",
          overflowY: "scroll",
        }}
      >
        {chatLog.map((entry, idx) => (
          <div key={idx}>
            <p>
              <strong>You:</strong> {entry.user}
            </p>
            <p>
              <strong>Bot:</strong> {entry.bot}
            </p>
            <hr />
          </div>
        ))}
        {loading && <p>Loading...</p>}
      </div>
      <form onSubmit={sendMessage}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          style={{ width: "80%" }}
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          Send
        </button>
      </form>
    </div>
  );
}
export default AiChat;
