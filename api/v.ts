import { createClient } from "@supabase/supabase-js";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const videoId = url.searchParams.get("id") || url.searchParams.get("v");

    if (!videoId) {
      return Response.redirect("https://www.jb-premium-hub.vip/home", 302);
    }

    // Kumuha ng Environment Variables mula sa iba't ibang posibleng pangalan
    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "";
    const supabaseAnonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "";

    let title = "JB Premium Hub";
    let description = "Watch on JB Premium Hub Vault";
    let imageUrl = "https://www.jb-premium-hub.vip/og-default.jpg";

    // Subukang kumuha ng metadata kung may valid na Supabase credentials
    if (supabaseUrl && supabaseAnonKey) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data: video } = await supabase
        .from("media")
        .select("title, description, thumbnail_url")
        .eq("id", videoId)
        .maybeSingle();

      if (video?.title?.trim()) title = video.title.trim();
      if (video?.description?.trim()) description = video.description.trim();
      if (video?.thumbnail_url?.trim()) {
        imageUrl = video.thumbnail_url.trim();
        if (imageUrl.startsWith("/")) {
          imageUrl = `https://www.jb-premium-hub.vip${imageUrl}`;
        }
      }
    }

    const redirectUrl = `https://www.jb-premium-hub.vip/home?v=${encodeURIComponent(videoId)}`;
    const canonicalUrl = `https://www.jb-premium-hub.vip/v/${encodeURIComponent(videoId)}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>${title} - JB Premium Hub</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${canonicalUrl}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="JB Premium Hub" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:secure_url" content="${imageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${imageUrl}" />
</head>
<body style="background:#0f172a;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;">
  <p>Loading video... <a href="${redirectUrl}" style="color:#38bdf8;">Open video</a></p>
  <script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (err) {
    console.error("Vercel Edge Function Error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}