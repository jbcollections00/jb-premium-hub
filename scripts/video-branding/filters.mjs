// Phase 351 — deterministic FFmpeg filtergraph helpers for private branded video.
// All branding happens on the ORIGINAL MAIN VIDEO; the intro has no overlays.
export function even(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 2) throw new Error("Invalid video dimension");
  return number % 2 === 0 ? number : number - 1;
}
export function canvasSize(width, height, maxLongEdge = 1920) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0 && h > 0)) throw new Error("Invalid video dimensions");
  const ratio = Math.min(1, maxLongEdge / Math.max(w, h));
  return { width: even(w * ratio), height: even(h * ratio) };
}
export function mainFilter({ width, height, opacity = 0.3, speed = 0.04 } = {}) {
  if (!(opacity >= 0 && opacity <= 1)) throw new Error("Opacity must be between 0 and 1");
  if (!(speed >= 0.005 && speed <= 0.4)) throw new Error("Speed must be between 0.005 and 0.4");
  const w = even(width), h = even(height);
  const markWidth = even(Math.min(w * 0.18, h * 0.33));
  const logoWidth = even(Math.min(w * 0.14, h * 0.25));
  const velocityX = Math.max(4, Math.round(w * speed));
  const velocityY = Math.max(3, Math.round(h * speed * 0.61));
  const margin = Math.max(6, Math.round(Math.min(w, h) * 0.025));
  // W/H are canvas dimensions; w/h refer to overlay dimensions.
  // abs(mod(...)) reflects motion at both edges, preventing any off-frame drawing.
  const x = `abs(mod(t*${velocityX}\\,2*(W-w))-(W-w))`;
  const y = `abs(mod(t*${velocityY}\\,2*(H-h))-(H-h))`;
  return [
    `[0:v:0]scale=${w}:${h}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v0]`,
    `[1:v:0]format=rgba,scale=${markWidth}:-2,colorchannelmixer=aa=${opacity}[wm]`,
    `[2:v:0]format=rgba,scale=${logoWidth}:-2[logo]`,
    `[v0][wm]overlay=x='${x}':y='${y}':eval=frame:format=auto:shortest=1[v1]`,
    `[v1][logo]overlay=x=W-w-${margin}:y=H-h-${margin}:format=auto:shortest=1,format=yuv420p[vout]`,
  ].join(";");
}
export function introFilter({ width, height } = {}) {
  const w = even(width), h = even(height);
  return `[0:v:0]scale=${w}:${h}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[vout]`;
}
export function cleanThumbnailPositions(duration, portrait) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid main duration");
  const last = Math.max(0, duration - 0.1);
  const positions = portrait ? [0.25, 1.25, 2.25] : [0.25];
  return positions.map((seconds) => Math.min(last, seconds));
}
