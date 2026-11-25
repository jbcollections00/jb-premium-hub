
/**
 * JB PREMIUM HUB — PHASE 123J-147
 * LIVE Billing Health Monitor
 *
 * READ ONLY.
 * No payments, settlement, membership grants,
 * queue updates, or automatic recovery.
 *
 * Requires:
 * SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
 * JB_LIVE_MONITOR_CALL_TOKEN
 *
 * Deploy with JWT verification disabled.
 * A separate Bearer token protects this endpoint.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const STALE_MINUTES = 15;
const OVERDUE_MINUTES = 15;

function respond(
  status: number,
  body: Record<string, unknown>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();

  const left = encoder.encode(a);
  const right = encoder.encode(b);

  if (left.length !== right.length) return false;

  let difference = 0;

  for (let i = 0; i < left.length; i++) {
    difference |= left[i] ^ right[i];
  }

  return difference === 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return respond(405, { error: "POST required" });
  }

  // This is a backend-only endpoint.
  if (req.headers.has("origin")) {
    return respond(403, { error: "Browser requests prohibited" });
  }

  const configuredToken =
    Deno.env.get("JB_LIVE_MONITOR_CALL_TOKEN") || "";

  if (configuredToken.length < 64) {
    return respond(503, {
      error: "Monitor authentication not configured",
    });
  }

  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(
    req.headers.get("authorization") || ""
  );

  if (
    !match ||
    !safeEqual(match[1], configuredToken)
  ) {
    return respond(401, {
      error: "Unauthorized",
    });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!url || !key) {
    return respond(503, {
      error: "Monitor database configuration missing",
    });
  }

  try {
    const db = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const now = Date.now();

    const staleCutoff = new Date(
      now - STALE_MINUTES * 60_000
    ).toISOString();

    const overdueCutoff = new Date(
      now - OVERDUE_MINUTES * 60_000
    ).toISOString();

    // All database operations below are SELECT only.
    const [
      stale,
      review,
      overdue,
    ] = await Promise.all([
      db
        .from("jb_billing_live_webhook_queue")
        .select("*", { count: "exact", head: true })
        .eq("processing_state", "processing")
        .not("claimed_at", "is", null)
        .lt("claimed_at", staleCutoff),

      db
        .from("jb_billing_live_webhook_queue")
        .select("*", { count: "exact", head: true })
        .eq("processing_state", "review_required"),

      db
        .from("jb_billing_live_webhook_queue")
        .select("*", { count: "exact", head: true })
        .eq("processing_state", "pending")
        .not("next_attempt_at", "is", null)
        .lt("next_attempt_at", overdueCutoff),
    ]);

    if (stale.error || review.error || overdue.error) {
      console.error("LIVE health monitor query failed");

      return respond(503, {
        status: "monitor_error",
        environment: "live",
      });
    }

    const checks = {
      stale_processing: stale.count ?? 0,
      manual_review_required: review.count ?? 0,
      overdue_pending: overdue.count ?? 0,
    };

    const alertRequired =
      checks.stale_processing > 0 ||
      checks.manual_review_required > 0 ||
      checks.overdue_pending > 0;

    return respond(alertRequired ? 503 : 200, {
      status: alertRequired ? "alert" : "healthy",
      environment: "live",
      checked_at: new Date(now).toISOString(),
      checks,
      read_only: true,
    });
  } catch {
    console.error("LIVE health monitor execution failed");

    return respond(503, {
      status: "monitor_error",
      environment: "live",
    });
  }
});
