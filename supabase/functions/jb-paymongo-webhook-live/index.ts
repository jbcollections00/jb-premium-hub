
/**
 * JB PREMIUM HUB — PHASE 123J-160
 * PayMongo LIVE Webhook Receiver
 *
 * SIGNATURE-VERIFIED, QUEUE-ONLY INTAKE.
 *
 * NEVER:
 * - Creates checkout sessions
 * - Marks payments paid
 * - Settles orders
 * - Grants membership
 *
 * Intake remains disabled unless:
 * JB_LIVE_WEBHOOK_RECORDING_ENABLED === "true"
 *
 * Required environment variables:
 * PAYMONGO_LIVE_WEBHOOK_SECRET
 * SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
 *
 * Database RPC:
 * public.jb_billing_record_enqueue_live_webhook_v1
 *
 * Deploy with legacy JWT verification OFF.
 */

import {
  createClient,
} from "npm:@supabase/supabase-js@2";

type Obj = Record<string, unknown>;

type EventEvidence = {
  eventId: string;
  sessionId: string;
  orderId: string;
};

const PAID_EVENT = "checkout_session.payment.paid";

const PURPOSE =
  "jb_membership_live_manual_checkout";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_SKEW_SECONDS = 300;

const EVENT_ID =
  /^evt_[A-Za-z0-9_-]{6,200}$/;

const SESSION_ID =
  /^cs_[A-Za-z0-9_-]{6,200}$/;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObj(value: unknown): value is Obj {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function respond(
  status: number,
  body: Obj,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type":
        "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function parseLiveSignature(
  header: string | null,
): { timestamp: string; signature: string } | null {
  if (!header || header.length > 1024) {
    return null;
  }

  const fields = new Map<string, string>();

  for (const entry of header.split(",")) {
    const separator = entry.indexOf("=");

    if (separator < 1) return null;

    const name = entry.slice(0, separator).trim();

    if (
      !["t", "te", "li"].includes(name) ||
      fields.has(name)
    ) {
      return null;
    }

    fields.set(
      name,
      entry.slice(separator + 1).trim(),
    );
  }

  const timestamp = fields.get("t") ?? "";
  const signature = fields.get("li") ?? "";

  if (
    !/^\d{10}(?:\d{3})?$/.test(timestamp) ||
    !/^[0-9a-f]{64}$/i.test(signature)
  ) {
    return null;
  }

  return { timestamp, signature };
}

function equalHex(
  digest: Uint8Array,
  signature: string,
): boolean {
  if (signature.length !== digest.length * 2) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < digest.length; i++) {
    const expected = Number.parseInt(
      signature.slice(i * 2, i * 2 + 2),
      16,
    );

    difference |= digest[i] ^ expected;
  }

  return difference === 0;
}

async function verifySignature(
  raw: Uint8Array,
  header: string | null,
  secret: string,
): Promise<boolean> {
  const parsed = parseLiveSignature(header);

  if (!parsed) return false;

  const timestamp = Number(parsed.timestamp) /
    (parsed.timestamp.length === 13 ? 1000 : 1);

  if (
    !Number.isFinite(timestamp) ||
    Math.abs(Date.now() / 1000 - timestamp) >
      MAX_SKEW_SECONDS
  ) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const prefix = new TextEncoder().encode(
    `${parsed.timestamp}.`,
  );

  const signed = new Uint8Array(
    prefix.length + raw.length,
  );

  signed.set(prefix);
  signed.set(raw, prefix.length);

  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      signed,
    ),
  );

  return equalHex(digest, parsed.signature);
}

function isRecognizedPaidEvent(
  body: unknown,
): boolean {
  if (!isObj(body) || !isObj(body.data)) {
    return false;
  }

  const data = body.data;

  if (
    data.type === "event" &&
    isObj(data.attributes)
  ) {
    return data.attributes.type === PAID_EVENT;
  }

  if (body.event_type === "send.webhook") {
    return data.type === PAID_EVENT;
  }

  return false;
}

/**
 * PayMongo account webhooks may receive checkout events created by
 * another website on the same merchant account. Only an unambiguously
 * identified foreign purpose can be acknowledged/ignored.
 * Missing/ambiguous purpose still fails closed for investigation.
 * This is checked ONLY after a valid LIVE HMAC signature.
 */
function isExplicitlyForeignPaidEvent(body: unknown): boolean {
  if (!isObj(body) || !isObj(body.data)) return false;
  const event = body.data;
  if (event.type !== "event" || typeof event.id !== "string" ||
      !EVENT_ID.test(event.id) || !isObj(event.attributes)) return false;
  const a = event.attributes;
  if (a.type !== PAID_EVENT || a.livemode !== true || !isObj(a.data)) return false;
  const session = a.data;
  if (session.type !== "checkout_session" ||
      typeof session.id !== "string" || !SESSION_ID.test(session.id) ||
      !isObj(session.attributes)) return false;
  const details = session.attributes;
  if (!isObj(details.metadata)) return false;
  const purpose = details.metadata.purpose;
  return typeof purpose === "string" && purpose.length > 0 && purpose !== PURPOSE;
}

/**
 * A provider may display/send only the paid checkout_session resource.
 * Without an evt_ identifier we CANNOT safely enqueue it; never silently
 * acknowledge an otherwise recognizable LIVE JB membership payment.
 * Keep the full event-envelope requirement and request manual review.
 */
function isBareLivePaidMembershipSession(body: unknown): boolean {
  if (!isObj(body) || body.type !== "checkout_session" ||
      typeof body.id !== "string" || !SESSION_ID.test(body.id) ||
      !isObj(body.attributes)) return false;
  const attrs = body.attributes;
  if (attrs.livemode !== true || !isObj(attrs.metadata) ||
      attrs.metadata.purpose !== PURPOSE ||
      !Array.isArray(attrs.payments)) return false;
  return attrs.payments.some((p: unknown) =>
    isObj(p) && p.type === "payment" &&
    isObj(p.attributes) && p.attributes.status === "paid");
}

function parseEvent(
  body: unknown,
): EventEvidence | null {
  if (!isObj(body) || !isObj(body.data)) {
    return null;
  }

  const event = body.data;

  // Existing LIVE queue RPC requires a genuine
  // provider event identifier, not a fabricated ID.
  //
  // Alternate send.webhook envelopes without
  // verified evt_ identity remain unsupported.

  if (
    event.type !== "event" ||
    typeof event.id !== "string" ||
    !EVENT_ID.test(event.id) ||
    !isObj(event.attributes)
  ) {
    return null;
  }

  const attributes = event.attributes;

  if (
    attributes.type !== PAID_EVENT ||
    attributes.livemode !== true ||
    !isObj(attributes.data)
  ) {
    return null;
  }

  const session = attributes.data;

  if (
    session.type !== "checkout_session" ||
    typeof session.id !== "string" ||
    !SESSION_ID.test(session.id) ||
    !isObj(session.attributes)
  ) {
    return null;
  }

  const details = session.attributes;

  // Outer event explicitly establishes LIVE mode.
  //
  // Allow absent nested livemode, but reject
  // an explicitly contradictory value.

  if (
    details.livemode !== undefined &&
    details.livemode !== true
  ) {
    return null;
  }

  if (
    typeof details.reference_number !== "string" ||
    !UUID.test(details.reference_number) ||
    !isObj(details.metadata)
  ) {
    return null;
  }

  const orderId = details.reference_number;

  if (
    details.metadata.order_id !== orderId ||
    details.metadata.purpose !== PURPOSE
  ) {
    return null;
  }

  return {
    eventId: event.id,
    sessionId: session.id,
    orderId,
  };
}

Deno.serve(
  async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return respond(405, {
        error: "POST required",
      });
    }

    // Deployment alone never enables intake.
    if (
      Deno.env.get(
        "JB_LIVE_WEBHOOK_RECORDING_ENABLED",
      ) !== "true"
    ) {
      return respond(503, {
        error: "LIVE webhook intake disabled",
      });
    }

    const secret = Deno.env.get(
      "PAYMONGO_LIVE_WEBHOOK_SECRET",
    );

    const url = Deno.env.get("SUPABASE_URL");

    const roleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    if (!secret || !url || !roleKey) {
      return respond(503, {
        error: "LIVE webhook not configured",
      });
    }

    const declaredLength = req.headers.get(
      "content-length",
    );

    if (declaredLength !== null) {
      const size = Number(declaredLength);

      if (
        !Number.isSafeInteger(size) ||
        size < 0
      ) {
        return respond(400, {
          error: "Invalid content length",
        });
      }

      if (size > MAX_BODY_BYTES) {
        return respond(413, {
          error: "Payload too large",
        });
      }
    }

    let raw: Uint8Array;

    try {
      raw = new Uint8Array(
        await req.arrayBuffer(),
      );

      if (raw.length > MAX_BODY_BYTES) {
        return respond(413, {
          error: "Payload too large",
        });
      }
    } catch {
      return respond(400, {
        error: "Unable to read request",
      });
    }

    let signatureValid = false;

    try {
      signatureValid = await verifySignature(
        raw,
        req.headers.get("paymongo-signature"),
        secret,
      );
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      return respond(401, {
        error: "Invalid webhook signature",
      });
    }

    let payload: unknown;

    try {
      payload = JSON.parse(
        new TextDecoder(
          "utf-8",
          { fatal: true },
        ).decode(raw),
      );
    } catch {
      return respond(400, {
        error: "Invalid JSON",
      });
    }

    const event = parseEvent(payload);

    if (!event) {
      // Explicitly unrelated checkout from another merchant project:
      // acknowledge only AFTER valid signature, never queue or settle.
      if (isExplicitlyForeignPaidEvent(payload)) {
        return respond(200, {
          received: true,
          ignored: true,
          reason: "foreign_purpose",
        });
      }
      if (isRecognizedPaidEvent(payload) ||
          isBareLivePaidMembershipSession(payload)) {
        // Never acknowledge a recognized LIVE
        // payment event that cannot be safely queued.
        return respond(503, {
          error:
            "LIVE checkout event format requires review",
        });
      }

      return respond(200, {
        received: true,
        ignored: true,
      });
    }

    const db = createClient(url, roleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    try {
      const { data, error } = await db.rpc(
        "jb_billing_record_enqueue_live_webhook_v1",
        {
          p_event_id: event.eventId,
          p_session_id: event.sessionId,
          p_order_id: event.orderId,
        },
      );

      if (error) {
        console.error(
          "LIVE webhook enqueue failed",
          error.code ?? "unknown",
        );

        return respond(503, {
          error:
            "Webhook intake temporarily unavailable",
        });
      }

      if (
        !isObj(data) ||
        !["queued", "duplicate"].includes(
          String(data.status),
        )
      ) {
        console.error(
          "LIVE webhook queue returned invalid result",
        );

        return respond(503, {
          error: "Webhook queue result requires review",
        });
      }

      return respond(200, {
        received: true,
        recorded: true,
        queued: true,
        duplicate: data.status === "duplicate",
        settlement_performed: false,
      });
    } catch {
      console.error(
        "LIVE webhook queue execution failed",
      );

      return respond(503, {
        error: "Webhook intake temporarily unavailable",
      });
    }
  },
);
