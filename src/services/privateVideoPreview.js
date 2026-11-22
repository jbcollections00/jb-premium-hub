/**
 * PRIVATE admin-only preview thumbnails. No network/video publishing.
 * For supported browser-decodable MP4: landscape = one frame;
 * portrait = 3 portrait frames merged side-by-side into one JPEG.
 * Start near 22s when possible (avoid intro), with a short-video fallback.
 * Returns Blob or null; the uploader displays the default JB logo on failure.
 */
const MAX_W = 720;
const MAX_H = 405;
const MAX_JPEG_BYTES = 1024 * 1024;

function waitFor(media, success, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      media.removeEventListener(success, onSuccess);
      media.removeEventListener("error", onFailure);
    };
    const onSuccess = () => { cleanup(); resolve(); };
    const onFailure = () => { cleanup(); reject(new Error("Video could not be decoded")); };
    media.addEventListener(success, onSuccess, { once: true });
    media.addEventListener("error", onFailure, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error("Video preview timed out")); }, timeoutMs);
  });
}

function seekTo(video, target) {
  if (Math.abs(video.currentTime - target) < 0.04 && video.readyState >= 2) {
    return Promise.resolve();
  }
  const pending = waitFor(video, "seeked", 12000);
  video.currentTime = target;
  return pending;
}

function getPositions(duration, portrait) {
  if (!Number.isFinite(duration) || duration <= 0) return portrait ? [0, 0, 0] : [0];
  const last = Math.max(0, duration - 0.25);
  const start = Math.min(last, duration > 24 ? 22 : duration * 0.45);
  if (!portrait) return [start];
  const remaining = Math.max(0, last - start);
  return [
    start,
    Math.min(last, start + remaining * 0.45),
    Math.min(last, start + remaining * 0.9),
  ];
}

function jpegBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(
      blob?.type === "image/jpeg" && blob.size > 0 && blob.size <= MAX_JPEG_BYTES
        ? blob : null
    ), "image/jpeg", quality);
  });
}

export async function capturePrivateVideoPreview(file) {
  if (!(file instanceof Blob) || file.size < 1) return null;
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return null;

  let video;
  let objectUrl;
  try {
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    objectUrl = URL.createObjectURL(file);
    const metadata = waitFor(video, "loadedmetadata");
    video.src = objectUrl;
    video.load();
    await metadata;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const portrait = vh > vw;
    const count = portrait ? 3 : 1;
    const aspect = vw / vh;
    const maxPanelWidth = portrait ? Math.floor(MAX_W / 3) : MAX_W;
    const scale = Math.min(1, maxPanelWidth / vw, MAX_H / vh);
    const panelWidth = Math.max(1, Math.floor(vw * scale));
    const panelHeight = Math.max(1, Math.floor(vh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = panelWidth * count;
    canvas.height = panelHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;

    const positions = getPositions(video.duration, portrait);
    for (let index = 0; index < count; index += 1) {
      const target = positions[index];
      if (target > 0 || video.readyState < 2) {
        await seekTo(video, target);
      }
      ctx.drawImage(video, index * panelWidth, 0, panelWidth, panelHeight);
    }
    for (const quality of [0.8, 0.65, 0.5]) {
      const jpeg = await jpegBlob(canvas, quality);
      if (jpeg) return jpeg;
    }
    return null;
  } catch {
    // The uploader retains a verified staged video even if this preview fails.
    return null;
  } finally {
    if (video) {
      try { video.pause(); video.removeAttribute("src"); video.load(); } catch {}
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
