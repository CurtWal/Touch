import React, { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";

const FIELDS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "company",
  "city",
  "state",
  "country",
  "timezone",
  "linkedin_url",
  "instagram_handle",
  "facebook_url",
  "tiktok_handle",
  "sms_opt_in",
  "email_opt_in",
  "messaging_opt_in",
  "quiet_hours_start",
  "quiet_hours_end",
  "tags",
  "notes",
];

function Upload() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formRows, setFormRows] = useState([]);
  const [crmData, setCrmData] = useState([]);
  const [newRow, setNewRow] = useState(
    FIELDS.reduce((acc, key) => ({ ...acc, [key]: "" }), {})
  );

  // Fetch CRM data on mount
  useEffect(() => {
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");
    if (!userId) return;
    setLoading(true);
    fetch(`https://touch-six.vercel.app/crm/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((contacts) => {
        setFormRows(contacts); // <-- overwrite instead of merge
        setCrmData(contacts);
      })
      .catch(() => setError("Failed to fetch CRM data"))
      .finally(() => setLoading(false));
  }, []);

  const onDrop = useCallback((acceptedFiles) => {
    setLoading(true);
    setError(null);
    const file = acceptedFiles[0];
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");
    const formData = new FormData();
    formData.append("file", file);
    fetch("https://touch-six.vercel.app//crm-upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        // After upload, fetch latest CRM data and overwrite formRows
        return fetch(`https://touch-six.vercel.app//crm/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .then((res) => res.json())
      .then((contacts) => {
        setFormRows(contacts); // <-- overwrite instead of merge
        setCrmData(contacts);
      })
      .catch((error) => setError(error.message))
      .finally(() => setLoading(false));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const handleInputChange = (e, idx) => {
    const { name, value } = e.target;
    setFormRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [name]: value } : row))
    );
  };

  const handleNewRowChange = (e) => {
    const { name, value } = e.target;
    setNewRow((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddRow = (e) => {
    e.preventDefault();
    setFormRows((prev) => [{ ...newRow, _unsaved: true }, ...prev]);
    setNewRow(FIELDS.reduce((acc, key) => ({ ...acc, [key]: "" }), {}));
  };

  const handleRemoveRow = (idx) => {
    setFormRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveRows = async () => {
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");
    const newRows = formRows.filter((row) => row._unsaved);

    if (newRows.length === 0) return;

    try {
      const res = await fetch("https://touch-six.vercel.app/crm-add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, contacts: newRows }),
      });
      const result = await res.json();
      if (result.success) {
        // Remove _unsaved flag from saved rows
        setFormRows((prev) => prev.map((row) => ({ ...row, _unsaved: false })));
        // Optionally, refetch CRM data
      } else {
        setError(result.error || "Failed to save rows");
      }
    } catch (err) {
      setError("Failed to save rows");
    }
  };
  return (
    <div>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      <h2>Uploaded Data (Form Table):</h2>
      <form onSubmit={handleAddRow}>
        <table
          border="1"
          cellPadding="5"
          style={{ borderCollapse: "collapse", width: "100%" }}
        >
          <tr>
            <td colSpan={FIELDS.length} style={{ textAlign: "right" }}>
              <button type="button" onClick={handleSaveRows}>
                Save New Rows
              </button>
            </td>
            <td colSpan={FIELDS.length} style={{ textAlign: "right" }}>
              <button type="submit">Add Row</button>
            </td>
          </tr>
          <thead>
            <tr>
              {FIELDS.map((key) => (
                <th key={key}>
                  {key
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (l) => l.toUpperCase())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {FIELDS.map((key) => (
                <td key={key}>
                  <input
                    type="text"
                    name={key}
                    value={newRow[key]}
                    onChange={handleNewRowChange}
                    style={{ width: "100%" }}
                  />
                </td>
              ))}
            </tr>
            {formRows.map((row, idx) => (
              <tr key={idx}>
                {FIELDS.map((key) => (
                  <td key={key}>
                    <input
                      type="text"
                      name={key}
                      value={row[key] !== undefined ? row[key] : ""}
                      onChange={(e) => handleInputChange(e, idx)}
                      style={{ width: "100%" }}
                    />
                  </td>
                ))}
                <td>
                  <button type="button" onClick={() => handleRemoveRow(idx)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </form>
      <div
        {...getRootProps()}
        style={{
          marginTop: 16,
          border: "2px dashed #888",
          padding: 16,
          textAlign: "center",
          cursor: "pointer",
        }}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>Drop the files here ...</p>
        ) : (
          <p>Drag 'n' drop some files here, or click to select files</p>
        )}
      </div>
    </div>
  );
}
export default Upload;
