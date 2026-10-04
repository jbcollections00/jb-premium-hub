import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const SITE_URL = "https://www.jb-premium-hub.vip";
const DEFAULT_IMAGE = `${SITE_URL}/og-default.jpg`;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Vercel rewrites /v/:id -> this function with ?id=:id or ?v=:id
  const videoId = url.searchParams.get("id") || url.searchParams.get("v");

  if (!videoId) {
    return Response.redirect(`${SITE_URL}/home`, 302);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Baguhin sa "media" kung "media" ang pangalan ng table sa DB
  const { data: video, error } = await supabase
    .from("media")
    .select("title, description, thumbnail_url")
    .eq("id", videoId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch video metadata:", error);
  }

  const rawTitle = video?.title?.trim() || "JB Premium Hub";
  const rawDescription =
    video?.description?.trim() || "Watch on JB Premium Hub Vault";

  let imageUrl = video?.thumbnail_url?.trim() || DEFAULT_IMAGE;

  if (imageUrl.startsWith("/")) {
    imageUrl = `${SITE_URL}${imageUrl}`;
  }

  const redirectUrl = `${SITE_URL}/home?v=${encodeURIComponent(videoId)}`;
  const canonicalShareUrl = `${SITE_URL}/v/${encodeURIComponent(videoId)}`;

  const title = escapeHtml(rawTitle);
  const description = escapeHtml(rawDescription);
  const safeImageUrl = escapeHtml(imageUrl);
  const safeCanonicalUrl = escapeHtml(canonicalShareUrl);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>${title} - JB Premium Hub</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${safeCanonicalUrl}" />

  <!-- Open Graph: Telegram / Messenger / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="JB Premium Hub" />
  <meta property="og:url" content="${safeCanonicalUrl}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${safeImageUrl}" />
  <meta property="og:image:secure_url" content="${safeImageUrl}" />
  <meta property="og:image:alt" content="${title}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <!-- Twitter/X cards -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${safeImageUrl}" />
</head>

<body style="background:#0f172a;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;">
  <p>
    Loading video...
    <a href="${redirectUrl}" style="color:#38bdf8;">Open video</a>
  </p>

  <script>
    window.location.replace(${JSON.stringify(redirectUrl)});
  </script>
</body>
</html>`;

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", "text/html; charset=utf-8");
  responseHeaders.set("Cache-Control", "public, max-age=300, s-maxage=300");

  return new Response(html, {
    status: 200,
    headers: responseHeaders,
  });
});