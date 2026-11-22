/**
 * Create a JPEG poster for the CURRENT ADMIN'S PRIVATE STAGING PREVIEW only.
 *
 * Never send the JPEG to a public-assets bucket or insert a public.media row.
 * Video bytes are loaded by the browser from the File object using a temporary
 * blob: URL, NOT by fetching a published/private playback endpoint.
 */
const MAX_WIDTH = 480;
const MAX_HEIGHT = 270;
const MAX_JPEG_BYTES = 1024 * 1024;

function awaitMediaEvent(media, success, failure, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      media.removeEventListener(success, onSuccess);
      media.removeEventListener("error", onFailure);
      if (failure && failure !== "error") media.removeEventListener(failure, onFailure);
    };
    const onSuccess = () => { cleanup(); resolve(); };
    const onFailure = () => { cleanup(); reject(new Error("Video preview could not be decoded.")); };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Video preview generation timed out."));
    }, timeoutMs);
    media.addEventListener(success, onSuccess, { once: true });
    media.addEventListener("error", onFailure, { once: true });
    if (failure && failure !== "error") media.addEventListener(failure, onFailure, { once: true });
  });
}

function encodeJpeg(canvas, quality = 0.76) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob?.type === "image/jpeg" && blob.size > 0 && blob.size <= MAX_JPEG_BYTES) {
        resolve(blob);
      } else {
        reject(new Error("Browser could not produce a small JPEG thumbnail."));
      }
    }, "image/jpeg", quality);
  });
}

/**
 * Returns a private JPEG Blob or null (unsupported codec/timeouts).
 * On failure callers should display the standard JB Collections logo.
 *
 * Does not mutate the original File or touch public storage.
 */
export async function capturePrivateVideoPreview(file) {
  if (!(file instanceof Blob) || file.size === 0) return null;
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return null;

  let video;
  let blobUrl;
  try {
    video = document.createElement("video");
    blobUrl = URL.createObjectURL(file);
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    // Attach the media event listener BEFORE setting src to avoid missing it.
    const metadata = awaitMediaEvent(video, "loadedmetadata");
    video.src = blobUrl;
    video.load();
    await metadata;

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const position = duration > 0 ? Math.min(1, duration / 3) : 0;

    if (position > 0) {
      const sought = awaitMediaEvent(video, "seeked");
      video.currentTime = position;
      await sought;
    } else if (video.readyState < 2) {
      await awaitMediaEvent(video, "loadeddata");
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;

    const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await encodeJpeg(canvas);
  } catch {
    // Some codecs are unsupported by browsers, particularly MKV/AVI.
    return null;
  } finally {
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}
