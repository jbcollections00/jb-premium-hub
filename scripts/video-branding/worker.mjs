#!/usr/bin/env node
// Phase 353: dedicated CI/container automatic branding worker.
// Run under a trusted scheduler with PRIVATE R2 + Supabase service-role secrets.
// Never deploy this program to the browser or Vercel serverless handlers.
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRIVATE_BUCKET, SETTINGS_KEY, destinationKey, sourceKey, verifyAssetConfig } from "./queue-contract.mjs";

const MAX_INPUT_BYTES = 2 * 1024 * 1024 * 1024;
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing worker secret/config: " + name);
  return value;
}
function createServices() {
  if (process.env.JB_BRANDING_WORKER_ENABLED !== "true") {
    throw new Error("Branding worker disabled");
  }
  const bucket = required("JB_STAGING_R2_BUCKET_NAME");
  if (bucket !== PRIVATE_BUCKET) throw new Error("Unexpected private bucket configuration");
  const account = required("R2_ACCOUNT_ID");
  return {
    db: createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    r2: new S3Client({
      region: "auto", endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      },
    }),
  };
}
async function readObject(r2, key, path, maxSize) {
  const head = await r2.send(new HeadObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key }));
  const bytes = Number(head.ContentLength);
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > maxSize) {
    throw new Error("Invalid private object size");
  }
  const object = await r2.send(new GetObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key }));
  if (!object.Body) throw new Error("Private object stream unavailable");
  await pipeline(object.Body, createWriteStream(path, { flags: "wx" }));
  if ((await stat(path)).size !== bytes) throw new Error("Private object read incomplete");
  return bytes;
}
async function readSettings(r2) {
  const obj = await r2.send(new GetObjectCommand({ Bucket: PRIVATE_BUCKET, Key: SETTINGS_KEY }));
  const raw = await obj.Body.transformToString();
  if (raw.length > 8192) throw new Error("Branding configuration too large");
  return verifyAssetConfig(JSON.parse(raw));
}
async function rpc(db, name, params) {
  const { data, error } = await db.rpc(name, params);
  if (error) throw new Error(name + ": " + (error.code || error.message));
  return data;
}
function processVideo(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL("./process.mjs", import.meta.url).pathname, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString().slice(-4096); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-4096); });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve(stdout) : reject(new Error("FFmpeg failed: " + stderr.slice(-650))));
  });
}
async function oneJob(services, settings, job) {
  const mediaId = String(job.media_id).toLowerCase();
  const version = settings.version;
  const key = sourceKey(mediaId, job.source_key);
  const outputKey = destinationKey(mediaId, version);
  const workspace = await mkdtemp(join(tmpdir(), "jb-brand-worker-"));
  const files = {
    main: join(workspace, "original.mp4"),
    intro: join(workspace, "intro.mp4"),
    watermark: join(workspace, "watermark.png"),
    logo: join(workspace, "logo.png"),
    output: join(workspace, "branded.mp4"),
    thumbnail: join(workspace, "thumbnail.jpg"),
  };
  try {
    // Read only exact server-selected keys; never accept a path from the website.
    await readObject(services.r2, key, files.main, MAX_INPUT_BYTES);
    await readObject(services.r2, settings.intro, files.intro, 100 * 1024 * 1024);
    await readObject(services.r2, settings.watermark, files.watermark, 5 * 1024 * 1024);
    await readObject(services.r2, settings.logo, files.logo, 5 * 1024 * 1024);
    await processVideo(Object.entries(files).flatMap(([name, path]) => ["--" + name, path]));
    const outputBytes = (await stat(files.output)).size;
    if (!(outputBytes > 1024)) throw new Error("Processed output is unexpectedly small");

    // Invalidate results if admin switched branding while this job ran.
    const currentSettings = await readSettings(services.r2);
    if (currentSettings.version !== version ||
        Object.keys({ intro: 1, watermark: 1, logo: 1 }).some((k) => currentSettings[k] !== settings[k])) {
      throw new Error("Branding assets changed during processing");
    }

    // Complete private output upload before recording ready status.
    // Buffer whole file is avoided: use a stream with a known length.
    const { createReadStream } = await import("node:fs");
    await services.r2.send(new PutObjectCommand({
      Bucket: PRIVATE_BUCKET, Key: outputKey,
      Body: createReadStream(files.output), ContentLength: outputBytes,
      ContentType: "video/mp4", CacheControl: "private, no-store",
    }));
    const head = await services.r2.send(new HeadObjectCommand({ Bucket: PRIVATE_BUCKET, Key: outputKey }));
    if (Number(head.ContentLength) !== outputBytes) throw new Error("R2 processed output HEAD mismatch");
    const finished = await rpc(services.db, "jb_branding_finish_v1", {
      p_media_id: mediaId, p_token: job.lease_token, p_version: version,
      p_size: outputBytes, p_error: null,
    });
    if (!finished) throw new Error("Stale job claim; processed object not published");
    process.stdout.write("Branded video ready: " + mediaId + " v" + version + "\n");
    return true;
  } catch (error) {
    const message = String(error?.message || error).slice(0,400);
    process.stderr.write("Branding job error " + mediaId + ": " + message + "\n");
    try {
      await rpc(services.db, "jb_branding_finish_v1", {
        p_media_id: mediaId, p_token: job.lease_token, p_version: version,
        p_size: null, p_error: message,
      });
    } catch (secondary) {
      process.stderr.write("Could not persist job error: " + String(secondary?.message || secondary) + "\n");
    }
    return false;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
async function main() {
  const services = createServices();
  const settings = await readSettings(services.r2);
  const requeued = await rpc(services.db, "jb_branding_prepare_v1", { p_version: settings.version });
  process.stdout.write("Active branding revision " + settings.version + ", reset jobs " + requeued + "\n");
  const limit = Math.min(5, Math.max(1, Number(process.env.JB_BRANDING_MAX_JOBS || 1)));
  for (let n = 0; n < limit; n++) {
    const claims = await rpc(services.db, "jb_branding_claim_v1", { p_version: settings.version });
    const job = Array.isArray(claims) ? claims[0] : null;
    if (!job) { process.stdout.write("No pending private branding jobs\n"); break; }
    await oneJob(services, settings, job);
  }
}
main().catch((error) => {
  process.stderr.write("Branding scheduler unavailable: " + String(error?.message || error) + "\n");
  process.exitCode = 1;
});
