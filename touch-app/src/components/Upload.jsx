import React, { useCallback, useState } from "react";
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
  const [data, setData] = useState([]);
  const [newRow, setNewRow] = useState(
    FIELDS.reduce((acc, key) => ({ ...acc, [key]: "" }), {})
  );

  const onDrop = useCallback((acceptedFiles) => {
    setLoading(true);
    setError(null);
    setData([]);
    const file = acceptedFiles[0];
    const formData = new FormData();
    formData.append("file", file);
    fetch("https://touch-liard.vercel.app/crm-upload", {
      method: "POST",
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {if(data.error) throw new Error(data.error); setData(data.rows || data);})
      .catch((error) => setError(error.message))
      .finally(() => setLoading(false));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const handleInputChange = (e, idx) => {
    const { name, value } = e.target;
    setData((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [name]: value } : row))
    );
  };

  const handleNewRowChange = (e) => {
    const { name, value } = e.target;
    setNewRow((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddRow = (e) => {
    e.preventDefault();
    setData((prev) => [{ ...newRow }, ...prev]); // Add new row at the top
    setNewRow(FIELDS.reduce((acc, key) => ({ ...acc, [key]: "" }), {}));
  };
  const handleRemoveRow = (idx) => {
    setData((prev) => prev.filter((_, i) => i !== idx));
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
            {/* Row for manual entry */}
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

            {/* Existing data rows */}
            {data.map((row, idx) => (
              <tr key={idx}>
                {FIELDS.map((key) => (
                  <td key={key}>
                    <input
                      type="text"
                      name={key}
                      value={row[key] || ""}
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
