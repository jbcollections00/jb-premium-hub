
/**
 * JB PREMIUM HUB — PHASE 123J-139
 *
 * Isolated PayMongo LIVE Webhook Signature Test
 *
 * SAFE:
 * - Uses generated dummy signing secret
 * - No LIVE or TEST API credentials
 * - No external API calls
 * - No payment or database operations
 *
 * Mirrors the signature verification logic
 * of jb-paymongo-webhook-live.
 */

import assert from "node:assert/strict";
import {
  createHmac,
  randomBytes,
} from "node:crypto";

const MAX_SKEW_SECONDS = 300;

function parseLiveSignature(header) {
  if (!header || header.length > 1024) return null;

  const values = new Map();

  for (const field of header.split(",")) {
    const pos = field.indexOf("=");

    if (pos < 1) return null;

    const name = field.slice(0, pos).trim();

    if (
      !["t", "te", "li"].includes(name) ||
      values.has(name)
    ) {
      return null;
    }

    values.set(name, field.slice(pos + 1).trim());
  }

  const t = values.get("t") || "";
  const sig = values.get("li") || "";

  if (
    !/^\d{10}(?:\d{3})?$/.test(t) ||
    !/^[0-9a-f]{64}$/i.test(sig)
  ) {
    return null;
  }

  return { t, sig };
}

function equalHex(actual, expected) {
  if (expected.length !== 2 * actual.length) {
    return false;
  }

  let diff = 0;

  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i] ^ Number.parseInt(
      expected.slice(i * 2, i * 2 + 2),
      16
    );
  }

  return diff === 0;
}

function verifySignature(rawBody, header, secret, nowMs) {
  const parsed = parseLiveSignature(header);

  if (!parsed) return false;

  const timestamp = Number(parsed.t) /
    (parsed.t.length === 13 ? 1000 : 1);

  if (
    !Number.isFinite(timestamp) ||
    Math.abs(nowMs / 1000 - timestamp) >
      MAX_SKEW_SECONDS
  ) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${parsed.t}.`)
    .update(rawBody)
    .digest();

  return equalHex(expected, parsed.sig);
}

function signPayload(rawBody, secret, timestamp) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest("hex");
}

// Generate safe dummy secrets.
const secret = randomBytes(32).toString("hex");
const wrongSecret = randomBytes(32).toString("hex");

const now = Date.now();
const timestamp = Math.floor(now / 1000).toString();

const payload = {
  data: {
    id: "evt_SIMULATED_SIGNATURE_TEST",
    type: "event",
    attributes: {
      type: "checkout_session.payment.paid",
      livemode: true,
      data: {
        id: "cs_SIMULATED_SIGNATURE_TEST",
        type: "checkout_session",
      },
    },
  },
};

const rawBody = Buffer.from(JSON.stringify(payload));

const validSignature = signPayload(
  rawBody,
  secret,
  timestamp
);

const validHeader =
  `t=${timestamp},li=${validSignature}`;

const oldTimestamp =
  (Math.floor(now / 1000) - 600).toString();

const futureTimestamp =
  (Math.floor(now / 1000) + 600).toString();

const tests = [
  {
    name: "Valid LIVE signature",
    body: rawBody,
    header: validHeader,
    key: secret,
    expected: true,
  },
  {
    name: "Missing signature header",
    body: rawBody,
    header: null,
    key: secret,
    expected: false,
  },
  {
    name: "Incorrect signing secret",
    body: rawBody,
    header: validHeader,
    key: wrongSecret,
    expected: false,
  },
  {
    name: "Modified webhook payload",
    body: Buffer.from(
      JSON.stringify({
        ...payload,
        modified: true,
      })
    ),
    header: validHeader,
    key: secret,
    expected: false,
  },
  {
    name: "Expired signature timestamp",
    body: rawBody,
    header:
      `t=${oldTimestamp},li=${signPayload(
        rawBody,
        secret,
        oldTimestamp
      )}`,
    key: secret,
    expected: false,
  },
  {
    name: "Future timestamp outside tolerance",
    body: rawBody,
    header:
      `t=${futureTimestamp},li=${signPayload(
        rawBody,
        secret,
        futureTimestamp
      )}`,
    key: secret,
    expected: false,
  },
  {
    name: "Duplicate timestamp field",
    body: rawBody,
    header:
      `t=${timestamp},t=${timestamp},li=${validSignature}`,
    key: secret,
    expected: false,
  },
  {
    name: "Malformed signature",
    body: rawBody,
    header: `t=${timestamp},li=invalid`,
    key: secret,
    expected: false,
  },
  {
    name: "Missing LIVE signature",
    body: rawBody,
    header: `t=${timestamp},te=${validSignature}`,
    key: secret,
    expected: false,
  },
  {
    name: "Valid millisecond timestamp",
    body: rawBody,
    header:
      `t=${now},li=${signPayload(
        rawBody,
        secret,
        String(now)
      )}`,
    key: secret,
    expected: true,
  },
];

let passed = 0;

console.log("\nJB PREMIUM HUB — LIVE WEBHOOK SIGNATURE TEST");
console.log("--------------------------------------------");

for (const test of tests) {
  const actual = verifySignature(
    test.body,
    test.header,
    test.key,
    now
  );

  try {
    assert.equal(actual, test.expected);

    console.log(`PASS: ${test.name}`);
    passed++;
  } catch {
    console.error(`FAIL: ${test.name}`);
    process.exitCode = 1;
  }
}

console.log("--------------------------------------------");
console.log(`Passed: ${passed}/${tests.length}`);

if (passed === tests.length) {
  console.log("RESULT: SIGNATURE VERIFICATION PASSED");
} else {
  console.log("RESULT: REVIEW REQUIRED");
}

console.log("Real PayMongo credentials used: NO");
console.log("External API calls: NONE");
console.log("LIVE payment processing: NONE");
