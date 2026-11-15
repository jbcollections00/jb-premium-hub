/**
 * JB Premium Hub - Phase 317D-1. PRIVATE local-only batch thumbnail generator.
 * Usage:
 *   node --env-file=.env.local scripts/thumbnails/batch-generate.mjs --inventory
 *   node --env-file=.env.local scripts/thumbnails/batch-generate.mjs --generate --offset=0 --limit=5
 *   node --env-file=.env.local scripts/thumbnails/batch-generate.mjs --generate --offset=5 --limit=25
 *
 * Deliberately NEVER uploads files, updates Supabase, or exposes private video URLs.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import {
  mkdir, readFile, rename, rm, stat, writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  S3Client, ListObjectsV2Command, GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { captureTimes, portraitOrientation } from "./batch-rules.mjs";

const ROOT = path.resolve(".local", "thumbnail-batch-317d");
const INVENTORY_FILE = path.join(ROOT, "inventory.json");
const PROGRESS_FILE = path.join(ROOT, "progress.json");
const VIDEO_PREFIX = "videos/";
const EXTENSION_RE = /\.(?:mp4|m4v|mov|webm|mkv)$/i;
const BUCKET =
  process.env.JB_THUMBNAIL_SOURCE_BUCKET ||
  process.env.R2_BUCKET_NAME ||
  "jb-collections-hub";

function option(name, fallback) {
  const value = process.argv.find((x) => x.startsWith(name + "="));
  return value ? value.slice(name.length + 1) : fallback;
}

const wantInventory = process.argv.includes("--inventory");
const wantGenerate = process.argv.includes("--generate");
const refresh = process.argv.includes("--refresh");
const retryFailed = process.argv.includes("--retry-failed");
const showHelp = process.argv.includes("--help");
const limit = Number(option("--limit", "25"));
const offset = Number(option("--offset", "0"));

function fail(message) {
  throw new Error(message);
}

function validateArgs() {
  if (showHelp) return;
  if (wantInventory === wantGenerate) {
    fail("Choose exactly one mode: --inventory OR --generate.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    fail("--limit must be between 1 and 50.");
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    fail("--offset must be a non-negative integer.");
  }
  if (refresh && !wantInventory) {
    fail("--refresh may only be used with --inventory.");
  }
  if (retryFailed && !wantGenerate) {
    fail("--retry-failed may only be used with --generate.");
  }
}

function createClient() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    fail("R2 credentials missing in private local .env file.");
  }
  return new S3Client({
    region: "auto",
    endpoint: "https://" + R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
    maxAttempts: 3,
  });
}

async function fileSize(filename) {
  try {
    const result = await stat(filename);
    return result.isFile() ? result.size : 0;
  } catch {
    return 0;
  }
}

async function readJson(filename) {
  try {
    return JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    fail("Invalid private local JSON file: " + path.basename(filename));
  }
}

async function saveJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = filename + ".tmp";
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  await rename(temporary, filename);
}

async function inventory(client) {
  const previous = await readJson(INVENTORY_FILE);
  if (previous && !refresh) {
    console.log("Inventory already exists. --refresh is required to replace it.");
    console.log("Videos in inventory:", previous.items?.length || 0);
    return;
  }

  console.log("Reading private R2 video metadata; no videos are downloaded.");
  const items = [];
  let token = null;
  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: VIDEO_PREFIX,
      MaxKeys: 1000,
      ...(token ? { ContinuationToken: token } : {}),
    }));
    for (const entry of response.Contents || []) {
      if (entry.Key && EXTENSION_RE.test(entry.Key) && Number(entry.Size) > 0) {
        items.push({ key: entry.Key, bytes: entry.Size });
      }
    }
    token = response.IsTruncated ? response.NextContinuationToken : null;
    if (items.length > 100000) fail("Aborting unusually large inventory.");
  } while (token);

  items.sort((a, b) => a.key.localeCompare(b.key));
  const document = {
    version: 1,
    bucket: BUCKET,
    prefix: VIDEO_PREFIX,
    created_at: new Date().toISOString(),
    items,
  };
  await saveJson(INVENTORY_FILE, document);
  console.log("Inventory saved locally. Video candidates:", items.length);
  console.log("No thumbnail images or database records were changed.");
}

function spawnSafe(command, args, { output = false, timeoutMs = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", output ? "pipe" : "ignore", "ignore"],
      windowsHide: true,
    });
    let stdout = "";
    let finished = false;
    let timedOut = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) reject(new Error(error));
      else resolve(stdout);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    if (output) {
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
        if (stdout.length > 200000) child.kill();
      });
    }
    child.on("error", () => finish("Unable to run " + command + "."));
    child.on("close", (code) => {
      if (timedOut) finish(command + " timed out.");
      else if (code !== 0) finish(command + " exited with an error.");
      else finish(null);
    });
  });
}

async function probeVideo(signedUrl) {
  const stdout = await spawnSafe("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries",
    "stream=width,height,duration:stream_tags=rotate:stream_side_data=rotation:format=duration",
    "-of", "json",
    signedUrl,
  ], { output: true, timeoutMs: 60000 });

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    fail("Video metadata was unreadable.");
  }
  const stream = parsed?.streams?.[0];
  if (!stream) fail("No video stream was found.");
  const duration = Number(parsed?.format?.duration || stream.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    fail("Video has no reliable duration.");
  }
  return {
    width: Number(stream.width),
    height: Number(stream.height),
    portrait: portraitOrientation(stream),
    duration,
  };
}

async function capture(signedUrl, time, filename, filter) {
  await spawnSafe("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    "-ss", String(time),
    "-i", signedUrl,
    "-frames:v", "1",
    "-vf", filter,
    "-q:v", "4",
    "-y", filename,
  ]);
  if (!(await fileSize(filename))) fail("Empty captured frame.");
}

async function createPreview(client, video, digest) {
  // Signed URL only exists briefly inside this process. Never log or save it.
  const signedUrl = await getSignedUrl(client, new GetObjectCommand({
    Bucket: BUCKET,
    Key: video.key,
  }), { expiresIn: 600 });

  const meta = await probeVideo(signedUrl);
  const times = captureTimes(meta.duration, meta.portrait);
  if (!times) {
    return {
      status: "SKIPPED_SHORT",
      duration_seconds: Number(meta.duration.toFixed(3)),
      orientation: meta.portrait ? "portrait" : "landscape",
      reason: "Insufficient video after the 22-second intro.",
    };
  }

  const filename = "preview-" + digest + ".jpg";
  const outputPath = path.join(ROOT, filename);
  const tempDir = path.join(ROOT, "temp-" + digest);
  await mkdir(ROOT, { recursive: true });
  await mkdir(tempDir, { recursive: true });

  try {
    if (!meta.portrait) {
      await capture(
        signedUrl, times[0], outputPath,
        "scale=960:-2:force_original_aspect_ratio=decrease"
      );
    } else {
      const frames = [];
      for (let i = 0; i < 3; i += 1) {
        const frame = path.join(tempDir, "panel-" + (i + 1) + ".jpg");
        await capture(signedUrl, times[i], frame, "scale=-2:640");
        frames.push(frame);
      }
      await spawnSafe("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-nostdin",
        "-i", frames[0], "-i", frames[1], "-i", frames[2],
        "-filter_complex",
        "[0:v]scale=-2:640[a];[1:v]scale=-2:640[b];[2:v]scale=-2:640[c];[a][b][c]hstack=inputs=3[v]",
        "-map", "[v]", "-frames:v", "1", "-q:v", "4", "-y", outputPath,
      ]);
    }

    const size = await fileSize(outputPath);
    if (!size) fail("Generated JPG is empty.");
    return {
      status: "REVIEW_REQUIRED",
      filename,
      bytes: size,
      layout: meta.portrait ? "portrait-3panel" : "single-landscape",
      duration_seconds: Number(meta.duration.toFixed(3)),
      source_width: meta.width,
      source_height: meta.height,
      timestamps_seconds: times,
    };
  } catch (error) {
    await rm(outputPath, { force: true }).catch(() => {});
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function generate(client) {
  const snapshot = await readJson(INVENTORY_FILE);
  if (!snapshot || !Array.isArray(snapshot.items)) {
    fail("No inventory.json. Run --inventory first.");
  }
  if (snapshot.bucket !== BUCKET || snapshot.prefix !== VIDEO_PREFIX) {
    fail("Inventory bucket/prefix differs from current source. Check settings.");
  }

  const end = Math.min(offset + limit, snapshot.items.length);
  const selected = snapshot.items.slice(offset, end);
  console.log("Batch:", offset, "through", end - 1, "of", snapshot.items.length);

  if (selected.length === 0) {
    console.log("No videos at this offset. Nothing changed.");
    return;
  }

  await spawnSafe("ffmpeg", ["-version"], { timeoutMs: 15000 });
  await spawnSafe("ffprobe", ["-version"], { timeoutMs: 15000 });

  const state = await readJson(PROGRESS_FILE) || {
    version: 1,
    bucket: BUCKET,
    updated_at: null,
    results: {},
  };
  if (state.bucket !== BUCKET || !state.results || typeof state.results !== "object") {
    fail("Local progress file is incompatible with current bucket.");
  }

  const summary = { generated: 0, already_completed: 0, skipped_short: 0, failed: 0, awaiting_retry: 0 };
  for (const [index, video] of selected.entries()) {
    const digest = crypto.createHash("sha256").update(video.key).digest("hex").slice(0, 16);
    const previous = state.results[digest];
    const previousImage = previous?.filename ? path.join(ROOT, previous.filename) : "";
    if (previous?.status === "REVIEW_REQUIRED" &&
      previous.private_video_key === video.key &&
      previousImage && (await fileSize(previousImage))) {
      summary.already_completed++;
      console.log("Item", index + 1, "/", selected.length, "- existing preview kept.");
      continue;
    }
    if (previous?.status === "SKIPPED_SHORT") {
      summary.skipped_short++;
      continue;
    }
    if (previous?.status === "FAILED" && !retryFailed) {
      summary.awaiting_retry++;
      continue;
    }

    try {
      const item = await createPreview(client, video, digest);
      state.results[digest] = {
        private_video_key: video.key,
        ...item,
        processed_at: new Date().toISOString(),
      };
      if (item.status === "REVIEW_REQUIRED") summary.generated++;
      else summary.skipped_short++;
      console.log("Item", index + 1, "/", selected.length, "-", item.status,
        item.layout ? "(" + item.layout + ")" : "");
    } catch (error) {
      state.results[digest] = {
        private_video_key: video.key,
        status: "FAILED",
        error: error?.message || "Unknown local generation error.",
        processed_at: new Date().toISOString(),
      };
      summary.failed++;
      console.log("Item", index + 1, "/", selected.length, "- FAILED; see local progress.json.");
    }
    state.updated_at = new Date().toISOString();
    await saveJson(PROGRESS_FILE, state); // Checkpoint after each item.
  }

  console.log("Summary:", JSON.stringify(summary));
  console.log("Private local output directory:", ROOT);
  console.log("NO public upload and NO database write occurred.");
  console.log("Review generated JPGs before the next publication phase.");
}

async function main() {
  validateArgs();
  if (showHelp) {
    console.log("Use --inventory [--refresh] OR --generate [--limit=25] [--offset=0] [--retry-failed].");
    console.log("All outputs remain local and private; nothing is uploaded.");
    return;
  }
  console.log("JB Premium Hub Phase 317D-1 / PRIVATE BATCH");
  console.log("Source bucket:", BUCKET);
  const client = createClient();
  try {
    if (wantInventory) await inventory(client);
    else await generate(client);
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  // No raw SDK errors or private presigned URLs in the console.
  console.error("Batch stopped:", error?.message || "Unknown error.");
  process.exitCode = 1;
});
