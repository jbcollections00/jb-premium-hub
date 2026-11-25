
import { createClient } from "@supabase/supabase-js";

// Type declaration for Vercel runtime environment variables.
// This fixes TS2580 without requiring @types/node.
declare const process: {
  env: Record<string, string | undefined>;
};

export const config = {
  runtime: "edge",
};

const SITE_ORIGIN = "https://www.jb-premium-hub.vip";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeImageUrl(value: string): string | null {
  try {
    const url = new URL(value, SITE_ORIGIN);

    if (url.protocol !== "https:") {
      return null;
    }

    if (url.username || url.password) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);

    const videoId =
      url.searchParams.get("id") ||
      url.searchParams.get("v");

    if (!videoId) {
      return Response.redirect(`${SITE_ORIGIN}/home`, 302);
    }

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
    let imageUrl = `${SITE_ORIGIN}/og-default.jpg`;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const supabase = createClient(
          supabaseUrl,
          supabaseAnonKey,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          }
        );

        const { data: video, error } = await supabase
          .from("media")
          .select("title, description, thumbnail_url")
          .eq("id", videoId)
          .maybeSingle();

        if (!error && video) {
          if (typeof video.title === "string" && video.title.trim()) {
            title = video.title.trim();
          }

          if (
            typeof video.description === "string" &&
            video.description.trim()
          ) {
            description = video.description.trim();
          }

          if (
            typeof video.thumbnail_url === "string" &&
            video.thumbnail_url.trim()
          ) {
            const validImage = safeImageUrl(
              video.thumbnail_url.trim()
            );

            if (validImage) {
              imageUrl = validImage;
            }
          }
        }
      } catch (error) {
        console.error(
          "OG metadata lookup failed:",
          error instanceof Error ? error.message : "unknown"
        );
      }
    }

    const redirectUrl =
      `${SITE_ORIGIN}/home?v=${encodeURIComponent(videoId)}`;

    const canonicalUrl =
      `${SITE_ORIGIN}/v/${encodeURIComponent(videoId)}`;

    const safeTitle = escapeHtml(title);
    const safeDescription = escapeHtml(description);
    const safeImage = escapeHtml(imageUrl);
    const safeCanonical = escapeHtml(canonicalUrl);
    const safeRedirect = escapeHtml(redirectUrl);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>${safeTitle} - JB Premium Hub</title>
  <meta name="description" content="${safeDescription}" />
  <link rel="canonical" href="${safeCanonical}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="JB Premium Hub" />
  <meta property="og:url" content="${safeCanonical}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:image:secure_url" content="${safeImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <meta name="twitter:image" content="${safeImage}" />
</head>
<body style="background:#0f172a;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;">
  <p>
    Loading video...
    <a href="${safeRedirect}" style="color:#38bdf8;">
      Open video
    </a>
  </p>
  <script>
    window.location.replace(${JSON.stringify(redirectUrl).replace(/</g, "\\u003c")});
  </script>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(
      "Vercel Edge Function Error:",
      error instanceof Error ? error.message : "unknown"
    );

    return new Response("Internal Server Error", {
      status: 500,
    });
  }
}
