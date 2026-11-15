// REVIEW-ONLY COPY of user's previously tested Worker source; NEVER auto-deploy this fixture.
// JB Premium Hub — authenticated private R2 video Worker (Phase 1).
// Binding: VIDEO_BUCKET -> jb-collections-hub.
// Secret: JB_PRIVATE_MEDIA_HMAC_SECRET, identical to Supabase Edge Function.
// Deployment safety: PRIVATE_MEDIA_ENABLED must equal the text "true".
// Do not enable until end-to-end FREE/STANDARD/VIP/admin tests have passed.

const ALLOWED_ORIGINS = new Set([
  "https://www.jb-premium-hub.vip",
  "https://jb-premium-hub.vip",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const decoder = new TextDecoder();
const encoder = new TextEncoder();

function responseHeaders(request) {
  const h = new Headers({
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  });
  const origin = request.headers.get("Origin");
  if (ALLOWED_ORIGINS.has(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Range, Content-Type");
    h.set("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range, Content-Disposition, ETag");
  }
  return h;
}

function json(request, status, data) {
  const headers = responseHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers });
}

function fromBase64url(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]+$/.test(s) || s.length > 8192) throw new Error("Bad base64url");
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function verifyTicket(ticket, secret, mediaId, action) {
  if (typeof ticket !== "string" || ticket.length > 8192 || secret.length < 48) return null;
  const parts = ticket.split(".");
  if (parts.length !== 2) return null;
  try {
    const [body, signature] = parts;
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key, fromBase64url(signature), encoder.encode(body)
    );
    if (!valid) return null;
    const p = JSON.parse(decoder.decode(fromBase64url(body)));
    const now = Math.floor(Date.now() / 1000);
    if (!p || p.v !== 1 || p.aud !== "jb-premium-private-media" ||
        p.mid !== mediaId || p.act !== action || !UUID_RE.test(p.sub || "") ||
        !Number.isInteger(p.iat) || !Number.isInteger(p.exp) ||
        p.iat > now + 30 || p.exp <= now || p.exp > p.iat + 1800 ||
        p.exp <= p.iat) return null;
    if (typeof p.key !== "string") return null;
    const isRoot = /^[A-Za-z0-9_-]+\.mp4$/i.test(p.key);
    const isFolder = /^videos\/[A-Za-z0-9._/-]+\.mp4$/i.test(p.key) &&
      !p.key.split("/").some((x) => !x || x === "." || x === "..");
    if (!isRoot && !isFolder) return null;
    return p;
  } catch {
    return null;
  }
}

function parseSingleRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || !size) return false;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return false;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return false;
    end = Math.min(end, size - 1);
  }
  return { start, end, length: end - start + 1 };
}

function numberedFilename(mediaId) {
  const hex = mediaId.replace(/[^a-f0-9]/gi, "");
  return `JB-Collections_${String(Number.parseInt(hex.slice(0, 12), 16) % 1000000000000).padStart(12, "0")}.mp4`;
}

export default {
  async fetch(request, env) {
    if (env.PRIVATE_MEDIA_ENABLED !== "true") {
      return json(request, 503, { status: "locked", message: "Private media delivery is not enabled yet" });
    }
    const origin = request.headers.get("Origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json(request, 403, { error: "Origin not allowed" });
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: responseHeaders(request) });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json(request, 405, { error: "GET or HEAD required" });
    }
    const url = new URL(request.url);
    const parts = /^\/v\/([0-9a-f-]{36})\/(play|download)$/.exec(url.pathname);
    if (!parts || !UUID_RE.test(parts[1])) return json(request, 404, { error: "Not found" });
    const [, mediaId, action] = parts;
    if (!env.VIDEO_BUCKET || typeof env.VIDEO_BUCKET.head !== "function") {
      return json(request, 503, { error: "Video storage unavailable" });
    }
    const secret = env.JB_PRIVATE_MEDIA_HMAC_SECRET || "";
    if (secret.length < 48) return json(request, 503, { error: "Signing secret unavailable" });
    const ticket = await verifyTicket(url.searchParams.get("ticket"), secret, mediaId, action);
    if (!ticket) return json(request, 403, { error: "Missing or expired media authorization" });

    try {
      const meta = await env.VIDEO_BUCKET.head(ticket.key);
      if (!meta) return json(request, 404, { error: "Media not found" });
      const size = meta.size;
      const range = parseSingleRange(request.headers.get("Range"), size);
      const h = responseHeaders(request);
      h.set("Content-Type", "video/mp4");
      h.set("Accept-Ranges", "bytes");
      h.set("ETag", meta.httpEtag);
      h.set("Content-Disposition", action === "download"
        ? `attachment; filename="${numberedFilename(mediaId)}"` : "inline");
      if (range === false) {
        h.set("Content-Range", `bytes */${size}`);
        return new Response(null, { status: 416, headers: h });
      }
      const status = range ? 206 : 200;
      h.set("Content-Length", String(range ? range.length : size));
      if (range) h.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
      if (request.method === "HEAD") return new Response(null, { status, headers: h });
      const object = await env.VIDEO_BUCKET.get(ticket.key, range
        ? { range: { offset: range.start, length: range.length } }
        : undefined);
      if (!object || !object.body) return json(request, 503, { error: "Video stream unavailable" });
      return new Response(object.body, { status, headers: h });
    } catch {
      return json(request, 503, { error: "Video streaming temporarily unavailable" });
    }
  },
};
