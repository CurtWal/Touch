import React, { useState } from "react";
import axios from "axios";

export default function PostBulkUpload() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);

  const handleFileUpload = async (e) => {
  e.preventDefault();

  if (!file) return alert("Select a file first");

    const formData = new FormData();
    formData.append("file", file); // must match upload.single('file')

    try {
      const res = await fetch("https://touch-six.vercel.app/api/posts/upload", {
        method: "POST",
        body: formData, // no headers!
      });
      const data = await res.json();
      console.log("Uploaded posts:", data);
      setResult(data);
    } catch (err) {
      console.error(err);
    }
};


  return (
    <div>
      <h3>Bulk upload posts (CSV/XLSX)</h3>
      <form onSubmit={handleFileUpload}>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files[0])}
          accept=".csv,.xlsx"
        />
        <button type="submit">Upload</button>
      </form>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
