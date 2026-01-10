import { toast } from "react-hot-toast";
import { usePlatformAuth } from "./usePlatformAuth";

export default function TwitterSection() {
  const { platforms, reload } = usePlatformAuth();

  const twitterAuth = platforms.find((p) => p.platform === "twitter");

  const twitterConnected = !!twitterAuth?.credentials?.accessToken;

  const hasMediaAccess =
    !!twitterAuth?.credentials?.oauthToken &&
    !!twitterAuth?.credentials?.oauthTokenSecret;

  const connectTwitter = () => {
    const token = localStorage.getItem("token");

    window.location.href =
      `${import.meta.env.VITE_API_URL}/auth/twitter?state=` + token;
  };

  const connectTwitterMedia = () => {
    const token = localStorage.getItem("token");

    window.location.href =
      `${import.meta.env.VITE_API_URL}/auth/twitter/oauth1?state=` + token;
  };

  const disconnectTwitter = async () => {
    try {
      const token = localStorage.getItem("token");

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/platforms/twitter`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) throw new Error("Failed");

      toast.success("X (Twitter) disconnected");
      reload();
    } catch {
      toast.error("Failed to disconnect X");
    }
  };

  return (
    <div className="p-4 border rounded-md space-y-3">
      <h2 className="font-bold text-xl">X (Twitter)</h2>

      {/* OAuth2 Status */}
      {twitterConnected ? (
        <p className="text-green-600">Account connected</p>
      ) : (
        <p className="text-red-600">Not connected</p>
      )}

      {/* OAuth1 Status */}
      {twitterConnected && (
        hasMediaAccess ? (
          <p className="text-green-600 text-sm">
            Media uploads enabled
          </p>
        ) : (
          <p className="text-yellow-600 text-sm">
            Media uploads not enabled
          </p>
        )
      )}

      {/* Actions */}
      {!twitterConnected && (
        <button onClick={connectTwitter}>
          Connect X
        </button>
      )}

      {twitterConnected && !hasMediaAccess && (
        <button onClick={connectTwitterMedia}>
          Enable Media Uploads
        </button>
      )}

      {twitterConnected && (
        <button onClick={disconnectTwitter}>
          Disconnect
        </button>
      )}
    </div>
  );
}
