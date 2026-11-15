/**
 * JB Premium HUB - Phase 317C: private, read-only R2 thumbnail pilot.
 *
 * Default: list up to 5 video candidates; --generate: extract JPG previews locally.
 * Does NOT upload, edit Supabase, or publish private video URLs.
 * Requires Node 22+, ffmpeg on PATH, and server-side R2 credentials in .env.local.
 */
import { spawn } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ENABLE_GENERATION = process.argv.includes("--generate");
const maxArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = maxArg ? Number(maxArg.slice("--limit=".length)) : 5;
if (!Number.isInteger(LIMIT) || LIMIT < 1 || LIMIT > 5) {
  throw new Error("Pilot limit must be an integer from 1 to 5.");
}

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
} = process.env;

const SOURCE_BUCKET =
  process.env.JB_THUMBNAIL_SOURCE_BUCKET ||
  process.env.R2_BUCKET_NAME ||
  "jb-collections-hub";
const PREFIX = "videos/";
const OUTPUT_DIR = path.resolve(".local", "thumbnail-pilot-317c");
const VIDEO_FORMATS = /\.(mp4|m4v|mov|webm|mkv)$/i;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  throw new Error(
    "Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY in local environment."
  );
}

const client = new S3Client({
  region: "auto",
  endpoint: "https://" + R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

function runProgram(executable, args, safeError) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true,
    });
    child.on("error", () => reject(new Error(safeError)));
    child.on("close", (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new Error(safeError + " (exit code " + exitCode + ")"));
    });
  });
}

async function findFiveVideos() {
  const items = [];
  let token;
  // Don't read the entire bucket for a five-video pilot.
  for (let page = 0; page < 10 && items.length < LIMIT; page += 1) {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: SOURCE_BUCKET,
      Prefix: PREFIX,
      MaxKeys: 200,
      ...(token ? { ContinuationToken: token } : {}),
    }));
    for (const obj of response.Contents || []) {
      if (obj.Key && VIDEO_FORMATS.test(obj.Key) && obj.Size > 0) {
        items.push({ key: obj.Key, bytes: obj.Size });
        if (items.length === LIMIT) break;
      }
    }
    if (!response.IsTruncated || !response.NextContinuationToken) break;
    token = response.NextContinuationToken;
  }
  return items;
}

async function generatePreview(video, index) {
  const digest = crypto.createHash("sha256").update(video.key).digest("hex").slice(0, 12);
  const filename = "preview-" + String(index + 1).padStart(2, "0") + "-" + digest + ".jpg";
  const absolute = path.join(OUTPUT_DIR, filename);
  const command = new GetObjectCommand({
    Bucket: SOURCE_BUCKET,
    Key: video.key,
  });
  // Short-lived *private* R2 authorization; never write this URL to disk or logs.
  const privateUrl = await getSignedUrl(client, command, { expiresIn: 600 });

  // Remote range requests minimize video transfer. FFmpeg executes only locally.
  await runProgram("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    "-ss", "1",
    "-i", privateUrl,
    "-frames:v", "1",
    "-vf", "scale=640:-2:force_original_aspect_ratio=decrease",
    "-q:v", "5",
    "-y", absolute,
  ], "Could not extract an image. Check FFmpeg, R2 permissions and video codec.");

  const info = await stat(absolute);
  if (!info.isFile() || info.size === 0) {
    throw new Error("Preview was empty: " + filename);
  }
  return { filename, bytes: info.size, status: "REVIEW_REQUIRED" };
}

async function main() {
  console.log("JB PREMIUM HUB / Phase 317C");
  console.log("Source bucket:", SOURCE_BUCKET);
  console.log("Mode:", ENABLE_GENERATION ? "LOCAL IMAGE GENERATION" : "READ-ONLY INVENTORY");
  const videos = await findFiveVideos();
  if (!videos.length) {
    console.log("No video files found under " + PREFIX + ". Nothing was changed.");
    return;
  }
  console.log("Found " + videos.length + " candidates in private storage.");

  if (!ENABLE_GENERATION) {
    console.table(videos.map((item, i) => ({
      number: i + 1,
      key: item.key,
      size_mb: (item.bytes / 1048576).toFixed(1),
    })));
    console.log("No images generated. Use --generate after reviewing the candidates.");
    return;
  }

  // Check that FFmpeg is available before generating any files.
  await runProgram("ffmpeg", ["-version"], "FFmpeg not found in PATH.");
  await mkdir(OUTPUT_DIR, { recursive: true });

  const result = [];
  for (const [index, video] of videos.entries()) {
    try {
      const preview = await generatePreview(video, index);
      result.push({ private_video_key: video.key, ...preview });
      console.log("Preview " + (index + 1) + " created:", preview.filename);
    } catch (error) {
      result.push({
        private_video_key: video.key,
        filename: null,
        status: "FAILED",
        error: error.message,
      });
      console.error("Preview " + (index + 1) + " failed:", error.message);
    }
  }

  const output = {
    phase: "317C",
    bucket: SOURCE_BUCKET,
    generated_at: new Date().toISOString(),
    production_database_changed: false,
    public_storage_changed: false,
    review_required: true,
    items: result,
  };
  const manifest = path.join(OUTPUT_DIR, "manifest.json");
  await writeFile(manifest, JSON.stringify(output, null, 2) + "\n", { flag: "w", mode: 0o600 });
  console.log("Local output:", OUTPUT_DIR);
  console.log("Pilot generated " + result.filter((item) => item.status === "REVIEW_REQUIRED").length +
    " previews. Review locally; do not publish them until approved.");
}

main().catch((error) => {
  // Never include raw signed URLs in error output.
  console.error("Pilot failed:", error.message);
  process.exitCode = 1;
});
