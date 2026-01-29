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
        `${import.meta.env.VITE_API_URL}/api/command`,
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
    <div style={{ maxWidth: 700, margin: "2rem auto" }} className="p-4 border rounded bg-white">
      <h2 className="text-black">AI Broadcast Command Based on CRM contacts</h2>
      <input
        type="text"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        placeholder='e.g. "Send message to all high priority contacts"'
        style={{ width: "100%", padding: "10px", fontSize: "16px" }}
        disabled={loading}
        className="border rounded px-3 py-2 mt-2 text-black"
      />
      <button
       className="ml-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        onClick={handleCommand}
        disabled={loading}
        style={{ marginTop: "10px", padding: "10px 20px", fontSize: "16px" }}
      >
        {loading ? "Processing..." : "Execute Command"}
      </button >
      {output && (
        <div style={{ marginTop: "20px", whiteSpace: "pre-wrap" }} className="mt-4 p-3 border rounded bg-gray-50 text-black">
          <strong>Result:</strong>
          <p>{output}</p>
        </div>
      )}
    </div>
  );
}

export default CommandSender;
