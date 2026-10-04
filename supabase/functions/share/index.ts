import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Extract video ID from query parameter
  const videoId = url.searchParams.get("id") || url.searchParams.get("v");

  if (!videoId) {
    return Response.redirect("https://www.jb-premium-hub.vip/home", 302);
  }

  // 1. Fetch video record from database
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: video } = await supabase
    .from("videos")
    .select("title, description, thumbnail_url")
    .eq("id", videoId)
    .single();

  const title = video?.title || "JB Premium Hub";
  const description = video?.description || "Watch on JB Premium Hub Vault";
  let imageUrl = video?.thumbnail_url || "https://www.jb-premium-hub.vip/og-default.jpg";

  if (imageUrl.startsWith("/")) {
    imageUrl = `https://www.jb-premium-hub.vip${imageUrl}`;
  }

  const redirectUrl = `https://www.jb-premium-hub.vip/home?v=${videoId}`;
  const canonicalShareUrl = `https://www.jb-premium-hub.vip/share?id=${videoId}`;

  // 2. Generate HTML payload with evaluated JS variables
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title} - JB Premium Hub</title>
  
  <!-- Open Graph / Messenger / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="JB Premium Hub" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${canonicalShareUrl}" />
  
  <!-- Twitter / Telegram -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${imageUrl}" />

  <!-- Instant redirect for real visitors -->
  <meta http-equiv="refresh" content="0; url=${redirectUrl}" />
  <script>
    window.location.href = "${redirectUrl}";
  </script>
</head>
<body style="background: #0f172a; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
  <p>Loading video... <a href="${redirectUrl}" style="color: #38bdf8;">Click here if you are not redirected</a>.</p>
</body>
</html>`;

  // 3. Return explicit HTTP 200 OK
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});