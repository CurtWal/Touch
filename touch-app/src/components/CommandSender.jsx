import React, { useState } from "react";
import axios from "axios";

function CommandSender() {
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [previewActions, setPreviewActions] = useState([]);
  const [confirming, setConfirming] = useState(false);

  const handlePreview = async () => {
    if (!command.trim()) {
      alert("Please enter a command");
      return;
    }
    setLoading(true);
    setOutput("");
    setPreviewActions([]);

    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/command/preview`,
        { command },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setPreviewActions(res.data.actions || []);
    } catch (err) {
      console.error(err);
      setOutput("❌ Failed to generate preview.");
    }

    setLoading(false);
  };

  const handleEditMessage = (actionIdx, contactIdx, newText) => {
    setPreviewActions((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy[actionIdx]) return prev;
      const action = copy[actionIdx];
      if (Array.isArray(action.contacts) && action.contacts[contactIdx]) {
        action.contacts[contactIdx].message = newText;
      } else if (!Array.isArray(action.contacts) && contactIdx === 0) {
        action.message = newText;
      }
      return copy;
    });
  };

  const handleConfirm = async () => {
    if (!previewActions.length) return;
    setConfirming(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/command/execute`,
        { actions: previewActions },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setOutput(res.data.reply || "✅ Sending started.");
      setPreviewActions([]);
    } catch (err) {
      console.error(err);
      setOutput("❌ Failed to send messages.");
    }
    setConfirming(false);
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
      <div className="flex items-center gap-2 mt-2">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          onClick={handlePreview}
          disabled={loading}
          style={{ padding: "10px 20px", fontSize: "16px" }}
        >
          {loading ? "Processing..." : "Preview Message"}
        </button>
        {previewActions.length > 0 && (
          <button
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
            onClick={handleConfirm}
            disabled={confirming}
            style={{ padding: "10px 20px", fontSize: "16px" }}
          >
            {confirming ? "Sending..." : "Confirm & Send"}
          </button>
        )}
        {previewActions.length > 0 && (
          <button
            className="px-3 py-2 bg-gray-200 text-white rounded"
            onClick={() => setPreviewActions([])}
            disabled={loading || confirming}
          >
            Cancel Preview
          </button>
        )}
      </div>
      {previewActions.length > 0 && (
        <div className="mt-4 p-3 border rounded bg-gray-50 text-black">
          <strong>Preview:</strong>
          {previewActions.map((act, ai) => (
            <div key={ai} className="mt-3">
              <div className="text-sm text-gray-600">Action: {act.action}</div>
              {(Array.isArray(act.contacts) ? act.contacts : [
                { name: act.name || "(unknown)", message: act.message || "" },
              ])
                .map((c, ci) => (
                  <div key={ci} className="mt-2 p-2 border rounded bg-white">
                    <div className="font-medium">To: {c.name || "(unknown)"}</div>
                    <textarea
                      value={c.message || ""}
                      onChange={(e) => handleEditMessage(ai, ci, e.target.value)}
                      rows={4}
                      className="w-full border rounded px-2 py-1 mt-1 text-black"
                    />
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

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
