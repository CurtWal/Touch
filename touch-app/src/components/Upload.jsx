import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
function Upload() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);


  const onDrop = useCallback((acceptedFiles) => {
    setLoading(null);
    setError(null);
    setData(null);
    const file = acceptedFiles[0];
    console.log(file)
    const formData = new FormData();
    formData.append("file", file);
    fetch("http://localhost:3000/upload", {
      method: "POST",
      body: formData,
    })
      .then((reponse) => reponse.json())
      .then((data) => setData(data))
      .catch((error) => setError(error.message))
      .finally(() => setLoading(false))
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });
  
  return (
    <div {...getRootProps()}>
        {loading && <p>Loading...</p>}
        {error && <p style={{color: 'red'}}>Error: {error}</p>}
        {data && Array.isArray(data) && data.length > 0 ? (
  <div>
    <h2>Uploaded Data:</h2>
    <table border="1" cellPadding="5" style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          {Object.keys(data[0])
            .filter((key) => key !== "Booking ID" && key !== "Date")
            .map((key) => (
              <th key={key}>{key}</th>
            ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, idx) => (
          <tr key={idx}>
            {Object.keys(data[0])
              .filter((key) => key !== "Booking ID" && key !== "Date")
              .map((key) => (
                <td key={key}>{row[key]}</td>
              ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
) : data ? (
  <pre>{JSON.stringify(data, null, 2)}</pre>
) : null}
      <input {...getInputProps()} />
      {isDragActive ? (
        <p>Drop the files here ...</p>
      ) : (
        <p>Drag 'n' drop some files here, or click to select files</p>
      )}
    </div>
  );
}
export default Upload;