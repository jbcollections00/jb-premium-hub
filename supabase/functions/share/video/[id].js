// File location: functions/share/video/[id].js

export async function onRequest({ params, env }) {
  const videoId = params.id;

  // 1. Fetch video from Supabase REST API
  const supabaseUrl = env.SUPABASE_URL || "https://your-supabase-project.supabase.co";
  const supabaseKey = env.SUPABASE_ANON_KEY || "your-anon-key";

  let video = { title: "JB Premium Hub", description: "Watch on JB Premium Hub", thumbnail_url: "https://www.jb-premium-hub.vip/og-default.jpg" };

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/videos?id=eq.${videoId}&select=title,description,thumbnail_url`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    });
    const data = await res.json();
    if (data && data[0]) video = data[0];
  } catch (err) {
    console.error("Failed to fetch video:", err);
  }

  // 2. Generate dynamic HTML with evaluated variables
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${video.title} - JB Premium Hub</title>
  
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="JB Premium Hub" />
  <meta property="og:title" content="${video.title}" />
  <meta property="og:description" content="${video.description || 'Watch on JB Premium Hub'}" />
  <meta property="og:image" content="${video.thumbnail_url}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="https://www.jb-premium-hub.vip/share/video/${videoId}" />
  
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${video.title}" />
  <meta name="twitter:description" content="${video.description || 'Watch on JB Premium Hub'}" />
  <meta name="twitter:image" content="${video.thumbnail_url}" />

  <meta http-equiv="refresh" content="0; url=https://www.jb-premium-hub.vip/home?v=${videoId}" />
</head>
<body style="background: #0f172a; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
  <p>Loading video... <a href="https://www.jb-premium-hub.vip/home?v=${videoId}" style="color: #38bdf8;">Click here if you are not redirected</a>.</p>
  <script>
    window.location.href = "https://www.jb-premium-hub.vip/home?v=${videoId}";
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}