import React, { useState, useEffect } from "react";
import axios from "axios";
import "../followup.css";
export default function FollowUpToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/user/settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data?.auto_follow_up_enabled !== undefined) {
          setEnabled(Boolean(res.data.auto_follow_up_enabled));
        }
      } catch (err) {
        console.error("Failed to fetch settings", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

   const toggle = async () => {
    let token = localStorage.getItem("token");
    // strip quotes if accidentally saved with JSON.stringify
    if (token && token.startsWith('"') && token.endsWith('"')) {
      token = token.slice(1, -1);
    }
    console.log("FollowUpToggle: token ->", token);
    if (!token) {
      console.error("No auth token found in localStorage");
      setEnabled((v) => !v); // revert optimistic UI
      return;
    }

    const newValue = !enabled;
    setEnabled(newValue);
    try {
      // 1) Save setting toggle
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/followups/toggle`,
        { enabled: newValue },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // 2) Start/stop the scheduler
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/auto-follow-up`,
        { enabled: newValue },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error("Failed to toggle followups", err.response?.data || err.message);
      setEnabled(!newValue);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <label className="followup-toggle">
  <span>Automated Follow-ups</span>
  
  <div className="switch-container">
    <span className="label">Off</span>

    <div className={`switch ${enabled ? "enabled" : ""}`} onClick={toggle}>
      <div className="thumb"></div>
    </div>

    <span className="label">On</span>
  </div>
</label>
  );
}
