import { useEffect } from "react";
import { toast } from "react-hot-toast";
import LinkedInSection from "./LinkedInSection";
import TwitterSection from "./TwitterSection";

export function SocialAccountsPage() {
  useEffect(() => {
  const params = new URLSearchParams(window.location.search);

  if (params.get("linkedin") === "connected") {
    toast.success("LinkedIn connected!");
  }

  if (params.get("twitter") === "connected") {
    toast.success("X connected!");
  }

  if (params.get("twitterMedia") === "connected") {
    toast.success("X media uploads enabled!");
  }

  if (params.get("twitter") === "error") {
    toast.error("X connection failed");
  }

  if (params.toString()) {
    window.history.replaceState({}, "", "/social-accounts");
  }
}, []);

  return (
    <div className="space-y-4">
      <LinkedInSection />
      <TwitterSection />
    </div>
  );
}
