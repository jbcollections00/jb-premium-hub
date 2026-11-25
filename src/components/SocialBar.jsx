import { useEffect } from "react";

const SOCIAL_BAR_SCRIPT_URL =
  "https://deeprootedpressure.com/77/84/87/7784879ac907b760977addd43bca7b1a.js";

export default function SocialBar({ enabled = true }) {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    // Only one Social Bar loader per page.
    if (document.querySelector('script[data-jb-social-bar="true"]')) return;

    const script = document.createElement("script");
    script.src = SOCIAL_BAR_SCRIPT_URL;
    script.async = true;
    script.dataset.jbSocialBar = "true";
    document.body.appendChild(script);

    return () => {
      // Remove our loader on unmount. Any network-created UI is managed by the ad script itself.
      script.remove();
    };
  }, [enabled]);

  return null;
}
