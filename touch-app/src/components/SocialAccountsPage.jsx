import { useEffect } from "react";
import { toast } from "react-hot-toast";
import LinkedInSection from "./LinkedInSection";

export function SocialAccountsPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("linkedin") === "connected") {
      toast.success("LinkedIn connected!");
      // Clear query params without reloading
      window.history.replaceState({}, "", "/social-accounts");
    }
  }, []);

  return <LinkedInSection />;
}
