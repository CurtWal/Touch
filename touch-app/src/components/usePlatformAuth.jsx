import { useState, useEffect } from "react";

export function usePlatformAuth() {
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPlatforms = async () => {
  try {
    const token = localStorage.getItem("token");

    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/platforms`, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    setPlatforms(data);
  } catch (err) {
    console.error("Failed to load platforms", err);
  } finally {
    setLoading(false);
  }
};


  useEffect(() => {
    loadPlatforms();
  }, []);

  return { platforms, loading, reload: loadPlatforms };
}
