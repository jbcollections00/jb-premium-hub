// Large private MP4 uploads: 16 MiB chunks, signed per-part R2 PUTs,
// server-side ListParts verification, and authenticated resume on reselect.
// No bucket credentials or multipart upload IDs are exposed to the UI.
const SAMPLE_BYTES = 1024 * 1024;
const MAX_RETRIES = 4;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Browser memory stays bounded: hash at most two 1 MiB samples and the size.
// Identical names and sizes alone are not sufficient to resume a draft.
export async function fingerprintPrivateVideo(file) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure browser context is required for resumable upload.");
  }
  const front = await file.slice(0, Math.min(SAMPLE_BYTES, file.size)).arrayBuffer();
  const back = await file.slice(Math.max(0, file.size - SAMPLE_BYTES)).arrayBuffer();
  const payload = new Uint8Array(8 + front.byteLength + back.byteLength);
  new DataView(payload.buffer).setBigUint64(0, BigInt(file.size));
  payload.set(new Uint8Array(front), 8);
  payload.set(new Uint8Array(back), 8 + front.byteLength);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", payload);
  return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

function uploadPart(url, chunk, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.timeout = 180000;
    xhr.setRequestHeader("Content-Type", "video/mp4");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(event.loaded, chunk.size));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("R2 chunk upload returned HTTP " + xhr.status));
    };
    xhr.onerror = () => reject(new Error("Connection interrupted during chunk upload."));
    xhr.ontimeout = () => reject(new Error("Chunk upload timed out."));
    xhr.onabort = () => reject(new Error("Chunk upload interrupted."));
    xhr.send(chunk);
  });
}

export async function uploadResumablePrivateVideo({
  file, draft, request, onProgress, onStatus,
}) {
  if (!draft?.multipart || !draft?.draftId || !draft?.partSize) {
    throw new Error("Server did not initialize a resumable upload.");
  }
  const partSize = Number(draft.partSize);
  const count = Math.ceil(file.size / partSize);
  if (!Number.isSafeInteger(partSize) || partSize < 5 * 1024 * 1024 ||
      partSize > 64 * 1024 * 1024 || count > 500) {
    throw new Error("Invalid server-provided multipart chunk size.");
  }
  const status = async () => {
    const state = await request("multipart-status", { draftId: draft.draftId });
    if (Number(state.partSize) !== partSize || Number(state.size) !== file.size) {
      throw new Error("Resumable upload metadata mismatch. No bytes were sent.");
    }
    return new Set(state.completedParts || []);
  };
  let completed = await status();
  const confirmedBytes = () => [...completed].reduce((sum, number) => {
    return sum + Math.min(partSize, file.size - (number - 1) * partSize);
  }, 0);
  onProgress(confirmedBytes());
  if (draft.resumed) onStatus("Resuming " + completed.size + "/" + count + " previously verified chunks…");

  for (let partNumber = 1; partNumber <= count; partNumber++) {
    if (completed.has(partNumber)) continue;
    const start = (partNumber - 1) * partSize;
    const chunk = file.slice(start, Math.min(file.size, start + partSize));
    let successful = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        onStatus("Uploading chunk " + partNumber + "/" + count +
          (attempt ? " · retry " + attempt + "/" + MAX_RETRIES : ""));
        const signed = await request("multipart-sign", {
          draftId: draft.draftId, partNumber,
        });
        if (!signed?.uploadUrl || Number(signed.size) !== chunk.size) {
          throw new Error("Invalid signed upload chunk.");
        }
        await uploadPart(signed.uploadUrl, chunk, (loaded) => {
          onProgress(Math.min(file.size, confirmedBytes() + loaded));
        });
        completed = await status(); // Never trust browser PUT completion alone.
        if (completed.has(partNumber)) {
          successful = true;
          onProgress(confirmedBytes());
          break;
        }
        throw new Error("Uploaded chunk was not confirmed by R2.");
      } catch (error) {
        // R2 may have received the part even when the browser lost the reply.
        try {
          completed = await status();
          if (completed.has(partNumber)) {
            successful = true;
            onProgress(confirmedBytes());
            break;
          }
        } catch { /* preserve original error and retry with new signature */ }
        if (attempt === MAX_RETRIES) {
          throw new Error(
            "Chunk " + partNumber + "/" + count + " could not finish. " +
            "Reselect this exact video to resume later. " + (error?.message || "")
          );
        }
        onProgress(confirmedBytes());
        await wait(Math.min(12000, 800 * (2 ** attempt)));
      }
    }
    if (!successful) throw new Error("Chunk upload failed. Reselect the file to resume.");
  }
  onStatus("All chunks uploaded; final server verification…");
  const final = await request("multipart-finish", { draftId: draft.draftId });
  if (final?.status !== "pending_review") {
    throw new Error("R2 multipart finalization was not confirmed.");
  }
  onProgress(file.size);
  return final;
}
