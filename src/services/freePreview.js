import { supabase } from "./supabaseClient";
import { LEGACY_CATALOG_HOME_HOLD } from "./legacyCatalogHold";
import { PRIVATE_MEDIA_UI_ENABLED } from "./privateMedia";

// Independent rollout: paid private playback can go live before FREE previews.
// Both frontend flags must be true; the Edge issuer has separate server gates.
export const FREE_PREVIEW_UI_ENABLED = PRIVATE_MEDIA_UI_ENABLED &&
  import.meta.env.VITE_JB_FREE_PREVIEW_UI_ENABLED === "true";

// Phase 315 reuses the SAME authenticated private R2 Worker as paid playback.
// Only the ticket issuer differs: jb-free-preview-ticket permits PLAY for
// videos explicitly selected by admins (maximum 20, checked server-side).
const PRIVATE_WORKER_ORIGIN =
  "https://jb-premium-private-media-v1.jbnetproxy.workers.dev";

const MEDIA_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function requestFreePreviewUrl(mediaId) {
  if (LEGACY_CATALOG_HOME_HOLD) {
    throw new Error("Legacy media access is paused while the new catalog is prepared.");
  }

  if (!FREE_PREVIEW_UI_ENABLED) {
    throw new Error("Secure video playback is not enabled yet");
  }
  if (!MEDIA_ID_PATTERN.test(String(mediaId || ""))) {
    throw new Error("Invalid video ID");
  }

  // supabase-js attaches the authenticated user token to this Edge Function.
  // The issuer re-verifies auth and media.is_free_preview in Supabase and signs
  // a short-lived PLAY-only Worker ticket. No R2 keys or URLs are client input.
  const { data, error } = await supabase.functions.invoke(
    "jb-free-preview-ticket",
    { body: { media_id: mediaId, action: "play" } },
  );

  if (error) {
    throw new Error("Free playback authorization is temporarily unavailable");
  }
  if (data?.status !== "issued" || typeof data.url !== "string") {
    throw new Error("Free playback authorization was not issued");
  }

  let url;
  try {
    url = new URL(data.url);
  } catch {
    throw new Error("Invalid private playback URL");
  }

  const expectedPath = "/v/" + mediaId + "/play";
  if (
    url.origin !== PRIVATE_WORKER_ORIGIN ||
    url.username ||
    url.password ||
    url.pathname.toLowerCase() !== expectedPath.toLowerCase() ||
    !url.searchParams.get("ticket") ||
    url.hash
  ) {
    throw new Error("Unexpected private playback destination");
  }

  // NEVER log or persist the signed ticket URL.
  // Reopening a video requests a fresh URL; there is no replay-count limit.
  return url.href;
}
