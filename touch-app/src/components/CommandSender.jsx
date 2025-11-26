import React, { useState } from "react";
import axios from "axios";

function CommandSender() {
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");

  const handleCommand = async () => {
    if (!command.trim()) {
      alert("Please enter a command");
      return;
    }

    setLoading(true);
    setOutput("");

    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "http://localhost:3000/api/command",
        { command },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setOutput(res.data.reply || "Done!");
    } catch (err) {
      console.error(err);
      setOutput("❌ Something went wrong.");
    }

    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 700, margin: "2rem auto" }}>
      <h2>AI Broadcast Command</h2>
      <input
        type="text"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        placeholder='e.g. "Send message to all high priority contacts"'
        style={{ width: "100%", padding: "10px", fontSize: "16px" }}
        disabled={loading}
      />
      <button
        onClick={handleCommand}
        disabled={loading}
        style={{ marginTop: "10px", padding: "10px 20px", fontSize: "16px" }}
      >
        {loading ? "Processing..." : "Execute Command"}
      </button>
      {output && (
        <div style={{ marginTop: "20px", background: "lightgray", padding: "10px" }}>
          <strong>Result:</strong>
          <p>{output}</p>
        </div>
      )}
    </div>
  );
}

export default CommandSender;
