#!/usr/bin/env node
// Phase 351 private-media preprocessing prototype.
// Usage: node scripts/video-branding/process.mjs --main main.mp4 --intro intro.mp4
//   --watermark watermark.png --logo logo.png --output branded.mp4 --thumbnail cover.jpg
// Requires ffmpeg + ffprobe installed on the processing machine.
// NEVER run FFmpeg on Vercel serverless / Cloudflare Worker for long videos.
import { spawn } from "node:child_process";
import { access, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { canvasSize, mainFilter, introFilter, cleanThumbnailPositions } from "./filters.mjs";

const parseArgs = (args) => {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith("--") || args[i + 1]?.startsWith("--")) throw new Error("Expected --name value arguments");
    values[args[i].slice(2)] = args[i + 1];
  }
  for (const key of ["main", "intro", "watermark", "logo", "output", "thumbnail"]) {
    if (!values[key]) throw new Error("Missing --" + key);
  }
  if (new Set(["main", "intro", "watermark", "logo", "output", "thumbnail"].map((key) => resolve(values[key]))).size !== 6) {
    throw new Error("Inputs and outputs must be distinct files");
  }
  return values;
};
function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stderr = [];
    child.stderr.on("data", (chunk) => {
      stderr.push(chunk.toString());
      if (stderr.length > 100) stderr.shift();
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolvePromise(stdout) : reject(new Error(command + " exited " + code + ": " + stderr.join("").slice(-2000)))
    );
  });
}
async function probe(path) {
  const data = JSON.parse(await run("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", path]));
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  if (!video) throw new Error("Video stream missing: " + path);
  const duration = Number(data.format?.duration || video.duration);
  if (!(duration > 0)) throw new Error("Invalid video duration");
  return { width: video.width, height: video.height, duration, audio: data.streams.some((s) => s.codec_type === "audio") };
}
const enc = [
  "-c:v", "libx264", "-preset", "medium", "-crf", "21",
  "-pix_fmt", "yuv420p", "-r", "30",
  "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
  "-movflags", "+faststart",
];
// An audio track is always generated, even for silent inputs, to keep concat consistent.
async function renderPart({ source, overlays, water, logo, output, dimension, hasAudio }) {
  const inputs = ["-i", source];
  if (overlays) inputs.push("-loop", "1", "-i", water, "-loop", "1", "-i", logo);
  if (!hasAudio) inputs.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  const audioInput = hasAudio ? "0:a:0" : (overlays ? "3:a:0" : "1:a:0");
  const video = overlays ? mainFilter(dimension) : introFilter(dimension);
  const filter = video + ` ;[${audioInput}]aresample=async=1:first_pts=0,apad[aout]`;
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", ...inputs,
    "-filter_complex", filter, "-map", "[vout]", "-map", "[aout]",
    ...enc, "-shortest", output,
  ]);
}
async function thumbnailFrame(main, at, output) {
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-ss", String(at),
    "-i", main, "-frames:v", "1", "-vf", "scale=720:405:force_original_aspect_ratio=decrease",
    "-q:v", "3", output,
  ]);
}
async function makeThumbnail(main, info, directory, destination) {
  const portrait = info.height > info.width;
  const seconds = cleanThumbnailPositions(info.duration, portrait);
  if (!portrait) {
    await thumbnailFrame(main, seconds[0], destination);
    return;
  }
  const frames = [];
  for (let i = 0; i < seconds.length; i += 1) {
    const path = join(directory, "panel-" + i + ".png");
    await thumbnailFrame(main, seconds[i], path);
    frames.push(path);
  }
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    ...frames.flatMap((file) => ["-i", file]),
    "-filter_complex", "[0:v]scale=240:405:force_original_aspect_ratio=decrease,pad=240:405:(ow-iw)/2:(oh-ih)/2:black[p0];[1:v]scale=240:405:force_original_aspect_ratio=decrease,pad=240:405:(ow-iw)/2:(oh-ih)/2:black[p1];[2:v]scale=240:405:force_original_aspect_ratio=decrease,pad=240:405:(ow-iw)/2:(oh-ih)/2:black[p2];[p0][p1][p2]hstack=inputs=3[out]",
    "-map", "[out]", "-frames:v", "1", "-q:v", "3", destination,
  ]);
}
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const paths = Object.fromEntries(Object.entries(options).map(([key, value]) => [key, resolve(value)]));
  for (const key of ["main", "intro", "watermark", "logo"]) {
    await access(paths[key]);
    if ((await stat(paths[key])).size < 1) throw new Error("Empty input: " + key);
  }
  const scratch = await mkdtemp(join(tmpdir(), "jbh-brand-"));
  const temporaryVideo = join(dirname(paths.output), ".branding-" + Date.now() + ".mp4");
  const temporaryThumbnail = join(dirname(paths.thumbnail), ".thumbnail-" + Date.now() + ".jpg");
  try {
    const [mainInfo, introInfo] = await Promise.all([probe(paths.main), probe(paths.intro)]);
    const dimension = canvasSize(mainInfo.width, mainInfo.height);
    // Thumbnail source is the original unbranded MAIN VIDEO.
    // Thus neither the inserted intro nor logo/watermark can contaminate it.
    await makeThumbnail(paths.main, mainInfo, scratch, temporaryThumbnail);
    const introPart = join(scratch, "intro.mp4");
    const mainPart = join(scratch, "main.mp4");
    await renderPart({ source: paths.intro, output: introPart, dimension, hasAudio: introInfo.audio, overlays: false });
    await renderPart({ source: paths.main, output: mainPart, dimension, hasAudio: mainInfo.audio, overlays: true, water: paths.watermark, logo: paths.logo });
    // Re-encode the splice to tolerate timestamp and encoder-header differences.
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", introPart, "-i", mainPart,
      "-filter_complex", "[0:v:0][0:a:0][1:v:0][1:a:0]concat=n=2:v=1:a=1[v][a]",
      "-map", "[v]", "-map", "[a]", ...enc, temporaryVideo,
    ]);
    await rename(temporaryVideo, paths.output);
    await rename(temporaryThumbnail, paths.thumbnail);
    process.stdout.write(JSON.stringify({
      status: "ready", output: paths.output, thumbnail: paths.thumbnail,
      orientation: mainInfo.height > mainInfo.width ? "portrait" : "landscape",
      introSeconds: introInfo.duration,
    }) + "\n");
  } finally {
    await rm(scratch, { recursive: true, force: true });
    await rm(temporaryVideo, { force: true });
    await rm(temporaryThumbnail, { force: true });
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
