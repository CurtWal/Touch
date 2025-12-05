import React, { useState } from "react";
import * as XLSX from "xlsx";

export default function PostBulkUpload({ onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  // const handleFileChange = (e) => {
  //   const f = e.target.files[0];
  //   setFile(f);

  //   // Read the file and log contents
  //   const reader = new FileReader();
  //   reader.onload = (evt) => {
  //     const data = evt.target.result;
  //     const workbook = XLSX.read(data, { type: "binary" });
  //     const sheetName = workbook.SheetNames[0];
  //     const sheet = workbook.Sheets[sheetName];
  //     const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  //     console.log("File preview:", rows);
  //     setPreview(rows); // optional, to show on page
  //   };
  //   reader.readAsBinaryString(f);
  // };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!file) return alert("Select a file first");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:3000/api/posts/upload", {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      //console.log("Uploaded posts:", data);
      if (onUploadSuccess) onUploadSuccess();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-white p-4 rounded shadow mb-4 text-black ">
      <h3>Bulk upload posts (CSV/XLSX)</h3>
      <form onSubmit={handleFileUpload} >
        <input
        className="p-2 rounded shadow mb-1 bg-gray-300 text-black hover-cursor-pointer"
          type="file"
          name="file" 
          // onChange={handleFileChange}
          accept=".csv,.xlsx"
        />
        <button type="submit" className="text-white">Upload</button>
      </form>

      {/* {preview && (
        <div>
          <h4>Preview:</h4>
          <pre>{JSON.stringify(preview, null, 2)}</pre>
        </div>
      )} */}
    </div>
  );
}
