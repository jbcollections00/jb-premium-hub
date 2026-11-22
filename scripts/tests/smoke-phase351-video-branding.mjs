#!/usr/bin/env node
// Integration smoke test. Uses only generated colored test clips and PNG assets.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function exec(command, args) {
  const run = spawnSync(command, args, { encoding: "utf8", timeout: 120000, maxBuffer: 2_000_000 });
  if (run.status !== 0) throw new Error(command + ": " + (run.stderr || run.error?.message));
  return run.stdout;
}
const temp = mkdtempSync(join(tmpdir(), "jbh-brand-ci-"));
try {
  const intro = join(temp, "intro.mp4");
  const main = join(temp, "main.mp4");
  const watermark = join(temp, "watermark.png");
  const logo = join(temp, "logo.png");
  const output = join(temp, "branded.mp4");
  const cover = join(temp, "cover.jpg");
  for (const [path, color, size, duration] of [
    [intro, "red", "320x180", "0.8"],
    [main, "blue", "180x320", "1.8"],
  ]) {
    exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", `color=c=${color}:s=${size}:r=30:d=${duration}`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", path]);
  }
  for (const [path, color] of [[watermark, "yellow@0.5"], [logo, "green@1"]]) {
    exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", `color=c=${color}:s=64x32:d=0.2,format=rgba`,
      "-frames:v", "1", "-threads", "1", path]);
  }
  const result = JSON.parse(exec("node", [
    "scripts/video-branding/process.mjs",
    "--main", main, "--intro", intro, "--watermark", watermark,
    "--logo", logo, "--output", output, "--thumbnail", cover,
  ]));
  assert.equal(result.status, "ready");
  assert.equal(result.orientation, "portrait");
  assert.ok(statSync(output).size > 2000);
  assert.ok(statSync(cover).size > 100);
  const video = JSON.parse(exec("ffprobe", [
    "-v", "error", "-show_format", "-show_streams", "-of", "json", output,
  ]));
  const stream = video.streams.find((s) => s.codec_type === "video");
  assert.equal(stream.width, 180);
  assert.equal(stream.height, 320);
  assert.ok(video.streams.some((s) => s.codec_type === "audio"));
  assert.ok(Number(video.format.duration) > 2.3);
  assert.ok(Number(video.format.duration) < 3.2);
  console.log("Phase351 FFmpeg smoke PASS: portrait, clean cover, stitched intro, branded MP4, audio.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
