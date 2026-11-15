import { supabase } from "./supabaseClient";

// Approved Free to Watch videos are served by a separate server-side access
// decision. No user, media URL, free flag, or signing secret is trusted here.
const R2_ORIGIN_SUFFIX = ".r2.cloudflarestorage.com";

export async function requestFreePreviewUrl(mediaId) {
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(String(mediaId || "")))
    throw new Error("Invalid video ID");

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) throw new Error("Please sign in to watch");

  const result = await fetch("/api/free-preview-url", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ media_id: mediaId }),
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });

  if (!result.ok) {
    if (result.status === 401) throw new Error("Please sign in again to continue");
    if (result.status === 403) throw new Error("This video requires a membership");
    throw new Error("Free playback is temporarily unavailable");
  }

  const data = await result.json();
  if (data?.status !== "issued" || typeof data.url !== "string") {
    throw new Error("Video playback authorization unavailable");
  }

  let signed;
  try { signed = new URL(data.url); } catch { throw new Error("Invalid playback destination"); }
  if (signed.protocol !== "https:" ||
      !signed.hostname.endsWith(R2_ORIGIN_SUFFIX) ||
      signed.username || signed.password || signed.hash ||
      !signed.searchParams.has("X-Amz-Signature") ||
      !signed.searchParams.has("X-Amz-Expires")) {
    throw new Error("Unexpected playback destination");
  }

  // Never log or persist the signed URL: keep it in React memory only.
  return signed.href;
}
