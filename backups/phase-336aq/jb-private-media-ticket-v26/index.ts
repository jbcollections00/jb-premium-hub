/*
 * JB PREMIUM HUB — PHASE 336AQ rollback snapshot only
 * Production function jb-private-media-ticket, version 26
 * Source hash 8b723b1536954cffe933912dff8bc4c440c8efbd66d3f28e7bb6700cc0a02a2f
 * Saved 2026-11-22 before production promotion; DO NOT auto-deploy.
 */

// JB Premium Hub — private media ticket issuer (Phase 1).
// Supabase Edge Function: jb-private-media-ticket
// Deployment safety: PRIVATE_MEDIA_TICKETS_ENABLED must be exactly "true".
// User JWT is verified via Supabase Auth; DB queries run with that user's RLS.
// Never put the signing secret in client-side VITE_* environment variables.

import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGINS = new Set([
  "https://www.jb-premium-hub.vip",
  "https://jb-premium-hub.vip",
]);
const WORKER_ORIGIN = "https://jb-premium-private-media-v1.jbnetproxy.workers.dev";
const CDN_HOST = "cdn.jb-premium-hub.vip";
const LEGACY_R2_HOST = "pub-0edb47f7f09d41ab9a7601f407e787b0.r2.dev";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();

function headersFor(req: Request): Headers {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  });
  const origin = req.headers.get("Origin");
  if (origin && APP_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
  }
  return headers;
}

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: headersFor(req) });
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function objectKeyFromStoredUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.search || u.hash) return null;
    // The exact legacy bucket hostname avoids accepting arbitrary users' public R2 buckets.
    let key: string;
    if (u.hostname === LEGACY_R2_HOST) {
      key = u.pathname.slice(1);
      if (!/^[A-Za-z0-9_-]+\.mp4$/i.test(key)) return null;
    } else if (u.hostname === CDN_HOST) {
      key = u.pathname.slice(1);
      if (!/^videos\/[A-Za-z0-9._/-]+\.mp4$/i.test(key)) return null;
      if (key.split("/").some((part) => !part || part === "." || part === "..")) return null;
    } else return null;
    return key;
  } catch {
    return null;
  }
}

async function signTicket(payload: Record<string, unknown>, secret: string): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return `${body}.${base64url(sig)}`;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (origin && !APP_ORIGINS.has(origin)) return json(req, 403, { error: "Origin not allowed" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headersFor(req) });
  if (req.method !== "POST") return json(req, 405, { error: "POST required" });
  if (Deno.env.get("PRIVATE_MEDIA_TICKETS_ENABLED") !== "true") {
    return json(req, 503, { status: "locked", error: "Private media tickets not enabled" });
  }

  const secret = Deno.env.get("JB_PRIVATE_MEDIA_HMAC_SECRET") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (secret.length < 48 || !supabaseUrl || !anonKey) {
    return json(req, 503, { error: "Server configuration incomplete" });
  }

  const bearer = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(bearer)) return json(req, 401, { error: "User login required" });
  const jwt = bearer.replace(/^Bearer\s+/i, "").trim();
  if (jwt.split(".").length !== 3) return json(req, 401, { error: "User login required" });

  let input: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return json(req, 413, { error: "Request too large" });
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid JSON");
    input = parsed as Record<string, unknown>;
  } catch {
    return json(req, 400, { error: "Invalid JSON request" });
  }
  const mediaId = input.media_id;
  const action = input.action;
  if (typeof mediaId !== "string" || !UUID_RE.test(mediaId) || !["play", "download"].includes(String(action))) {
    return json(req, 400, { error: "Invalid media_id or action" });
  }

  // Do not use the service_role key here: authorization must remain user-scoped.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !authData?.user?.id) return json(req, 401, { error: "Invalid user session" });

    const { data: adminValue, error: adminError } = await supabase.rpc("is_current_user_admin");
    if (adminError || typeof adminValue !== "boolean") {
      return json(req, 503, { error: "Unable to verify admin role" });
    }
    const isAdmin = adminValue === true;

    let entitlementExpiry: number | null = null;
    if (!isAdmin) {
      const { data: accessRows, error: accessError } = await supabase.rpc("jb_billing_my_access");
      if (accessError || !Array.isArray(accessRows) || accessRows.length !== 1) {
        return json(req, 503, { error: "Unable to verify membership" });
      }
      const access = accessRows[0] as Record<string, unknown>;
      const tier = String(access.tier || "").toLowerCase();
      const validTier = tier === "standard" || tier === "vip";
      const expiry = Date.parse(String(access.access_expires_at || ""));
      if (!validTier || access.can_view_albums !== true || !Number.isFinite(expiry) || expiry <= Date.now()) {
        return json(req, 403, { error: "Active membership required" });
      }
      if (action === "download" && (tier !== "vip" || access.can_download !== true)) {
        return json(req, 403, { error: "VIP download permission required" });
      }
      entitlementExpiry = Math.floor(expiry / 1000);
    }

    // Media is obtained using the user's RLS; FREE users cannot read video records.
    const { data: media, error: mediaError } = await supabase
      .from("media")
      .select("id, media_url, type")
      .eq("id", mediaId)
      .eq("type", "video")
      .maybeSingle();
    if (mediaError) return json(req, 503, { error: "Unable to verify media record" });
    if (!media) return json(req, 404, { error: "Media not available" });

    const key = objectKeyFromStoredUrl(String(media.media_url || ""));
    if (!key) return json(req, 422, { error: "Video storage key not yet supported" });

    const now = Math.floor(Date.now() / 1000);
    const ttl = action === "download" ? 300 : 1800;
    const exp = Math.min(now + ttl, entitlementExpiry ?? now + ttl);
    if (exp <= now) return json(req, 403, { error: "Membership expired" });
    const ticket = await signTicket({
      v: 1, aud: "jb-premium-private-media", sub: authData.user.id,
      mid: mediaId, act: action, key, iat: now, exp,
    }, secret);

    const url = `${WORKER_ORIGIN}/v/${mediaId}/${action}?ticket=${encodeURIComponent(ticket)}`;
    return json(req, 200, { status: "issued", media_id: mediaId, action, url, expires_at: new Date(exp * 1000).toISOString() });
  } catch {
    // Avoid returning database internals, keys, or bearer tokens in errors.
    return json(req, 503, { error: "Private media authorization unavailable" });
  }
});
