import { useEffect } from "react";
import { usePlatformAuth } from "./usePlatformAuth";
import { toast } from "react-hot-toast";

export default function LinkedInSection() {
  const { platforms, reload } = usePlatformAuth();

  const linkedInAuth = platforms.find((p) => p.platform === "linkedin");
  const linkedInConnected = !!linkedInAuth;

  const connectLinkedIn = () => {
    const token = localStorage.getItem("token");

    window.location.href =
      `${import.meta.env.VITE_API_URL}/auth/linkedin?state=` + token;
  };

  const disconnectLinkedIn = async () => {
    try {
      const token = localStorage.getItem("token");

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/platforms/linkedin`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) throw new Error("Unauthorized");

      toast.success("LinkedIn disconnected");
      reload();
    } catch (err) {
      toast.error("Failed to disconnect LinkedIn");
    }
  };

  return (
    <div className="p-4 border rounded-md">
      <h2 className="font-bold text-xl mb-2">LinkedIn</h2>

      {linkedInConnected ? (
        <>
          <p className="text-green-600 mb-3">Connected</p>
          <button variant="destructive" onClick={disconnectLinkedIn}>
            Disconnect
          </button>
        </>
      ) : (
        <>
          <p className="text-red-600 mb-3">Not Connected</p>
          <button onClick={connectLinkedIn}>Connect LinkedIn</button>
        </>
      )}
    </div>
  );
}
