# Phase 317C - Five-video thumbnail pilot

This pilot generates up to five local JPG previews from video files already in the private Cloudflare R2 bucket. It is intentionally NOT wired into the live site yet.

Safety:
- Default run is read-only inventory of video keys under videos/.
- The --generate flag creates only local files in .local/thumbnail-pilot-317c/.
- No public R2 uploads, no Supabase SQL updates, no videos modified, and no billing changes.
- Generated images are not yet approved for publication. Review content and ensure the images are suitable for the public gallery before any later migration.
- Presigned private video URLs exist only in short-lived FFmpeg process arguments; the script never logs or saves them. Do not share process diagnostics containing command lines while generating.
- Never commit .env.local or generated images to Git.

## Requirements

1. Windows laptop with Node.js 22+ and npm ci already installed.
2. FFmpeg installed and available on PowerShell's PATH (ffmpeg -version).
3. Cloudflare R2 read permission to the private bucket containing videos.
4. In the local root .env.local (already ignored by Git), the following server-side values:

    R2_ACCOUNT_ID=<your Cloudflare account ID>
    R2_ACCESS_KEY_ID=<R2 key with read permission>
    R2_SECRET_ACCESS_KEY=<matching private secret>
    JB_THUMBNAIL_SOURCE_BUCKET=jb-collections-hub

   Do not paste these values into ChatGPT, screenshots, logs, or GitHub. The bucket can be set differently if your actual private video bucket has another name. Do not put these credentials in VITE_ prefixed variables.

## PowerShell commands (project root)

Check FFmpeg:

    ffmpeg -version

Preview which five video objects would be used (no generated files):

    node --env-file=.env.local scripts/thumbnails/pilot-generate.mjs

Generate at most five local JPGs:

    node --env-file=.env.local scripts/thumbnails/pilot-generate.mjs --generate

Or start with only two:

    node --env-file=.env.local scripts/thumbnails/pilot-generate.mjs --generate --limit=2

Inspect .local/thumbnail-pilot-317c/manifest.json and the corresponding JPGs. If none are generated, check the console for the safe error message; the script should never touch production data.

Next milestone: Once the five images have been reviewed and the media-to-R2 object mapping is validated, develop a separate explicitly approved upload and conditional database-update workflow for the dedicated public-assets bucket. Do not point public previews directly at the private video R2 bucket.
