import { supabase } from "./supabaseClient";

// Staging flag. OFF unless explicitly set to the string "true" at build time.
// Do not enable until the Worker is unlocked and frontend permission tests pass.
export const PRIVATE_MEDIA_UI_ENABLED =
  import.meta.env.VITE_JB_PRIVATE_MEDIA_UI_ENABLED === "true";

const PRIVATE_WORKER_ORIGIN =
  "https://jb-premium-private-media-v1.jbnetproxy.workers.dev";

const MEDIA_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Request a short-lived, server-authorized URL for exactly one media action.
 * The server must enforce LIVE membership or admin status. Never use the UI
 * feature flag, browser profile fields, or this function as authorization.
 *
 * @param {string} mediaId - UUID from the media table.
 * @param {"play"|"download"} action - Requested permission.
 * @returns {Promise<string>} Verified HTTPS Worker URL (sensitive: do not log).
 */
export async function requestPrivateMediaUrl(mediaId, action) {
  if (!PRIVATE_MEDIA_UI_ENABLED) {
    throw new Error("Private media frontend is disabled");
  }
  if (!MEDIA_ID_PATTERN.test(String(mediaId || ""))) {
    throw new Error("Invalid media ID");
  }
  if (action !== "play" && action !== "download") {
    throw new Error("Unsupported media action");
  }

  // supabase-js sends the signed-in user's Authorization header. The Edge
  // Function independently checks auth, payment entitlements and media key.
  const { data, error } = await supabase.functions.invoke(
    "jb-private-media-ticket",
    {
      body: { media_id: mediaId, action },
    }
  );

  if (error) {
    throw new Error("Private media authorization failed");
  }
  if (!data || data.status !== "issued" || typeof data.url !== "string") {
    throw new Error("Private media ticket was not issued");
  }

  let url;
  try {
    url = new URL(data.url);
  } catch {
    throw new Error("Invalid private media URL");
  }

  const expectedPath = `/v/${mediaId}/${action}`;
  if (
    url.origin !== PRIVATE_WORKER_ORIGIN ||
    url.username ||
    url.password ||
    url.pathname.toLowerCase() !== expectedPath.toLowerCase() ||
    !url.searchParams.has("ticket") ||
    !url.searchParams.get("ticket") ||
    url.hash
  ) {
    throw new Error("Unexpected private media destination");
  }

  // Signed ticket is embedded in this URL. Never log it, persist it in local
  // storage, include it in analytics, or share it as a public video link.
  return url.href;
}

// Branded downloads are delivered only by the authenticated server-side
// private R2 signer, never by the old original-file ticket endpoint.
export async function requestBrandedDownloadUrl(mediaId) {
  if (!MEDIA_ID_PATTERN.test(String(mediaId || ""))) throw new Error("Invalid media ID");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error("Login required");
  const base = String(import.meta.env.VITE_R2_SIGNER_URL || "").replace(/\/+$/, "");
  const response = await fetch((base || "") + "/api/jb-branded-download", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + data.session.access_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mediaId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Branded download unavailable");
  if (payload.status !== "ready" || typeof payload.url !== "string") {
    throw new Error("Branded file is not ready");
  }
  const url = new URL(payload.url);
  if (url.protocol !== "https:" || url.username || url.password ||
      !url.hostname.endsWith(".r2.cloudflarestorage.com") ||
      !url.searchParams.has("X-Amz-Signature")) {
    throw new Error("Unexpected signed download location");
  }
  return url.href;
}
