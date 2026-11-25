
/**
 * JB PREMIUM HUB — PHASE 123J-138
 *
 * Isolated LIVE Worker Authentication Test
 *
 * SAFE:
 * - No real credentials
 * - No PayMongo requests
 * - No Supabase requests
 * - No payment processing
 * - No database modifications
 *
 * Tests the same Bearer-token comparison
 * approach used by the LIVE worker.
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const encode = (value) => new TextEncoder().encode(value);

function safeEqual(a, b) {
  const x = encode(a);
  const y = encode(b);

  let mismatch = x.length ^ y.length;

  const n = Math.max(x.length, y.length);

  for (let i = 0; i < n; i++) {
    mismatch |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }

  return mismatch === 0;
}

function authorize(presented, token) {
  if (
    token.length < 32 ||
    !safeEqual(presented, `Bearer ${token}`)
  ) {
    return {
      status: 401,
      body: { error: "Unauthorized" },
    };
  }

  return {
    status: 200,
    body: { authenticated: true },
  };
}

const token = randomBytes(32).toString("hex");
const wrongToken = randomBytes(32).toString("hex");

const tests = [
  {
    name: "Missing Authorization header",
    presented: "",
    expected: 401,
  },
  {
    name: "Invalid Bearer token",
    presented: `Bearer ${wrongToken}`,
    expected: 401,
  },
  {
    name: "Missing Bearer prefix",
    presented: token,
    expected: 401,
  },
  {
    name: "Wrong authentication scheme",
    presented: `Basic ${token}`,
    expected: 401,
  },
  {
    name: "Valid Bearer token",
    presented: `Bearer ${token}`,
    expected: 200,
  },
  {
    name: "Modified Bearer token",
    presented: `Bearer ${token.slice(0, -1)}x`,
    expected: 401,
  },
];

let passed = 0;

console.log("\nJB PREMIUM HUB — LIVE AUTH TEST");
console.log("--------------------------------");

for (const test of tests) {
  try {
    const result = authorize(test.presented, token);

    assert.equal(result.status, test.expected);

    console.log(`PASS: ${test.name}`);
    passed++;
  } catch {
    console.error(`FAIL: ${test.name}`);
    process.exitCode = 1;
  }
}

const shortToken = authorize(
  "Bearer abc",
  "abc"
);

assert.equal(shortToken.status, 401);

console.log("PASS: Short secret rejected");
passed++;

console.log("--------------------------------");
console.log(`Passed: ${passed}/7`);
console.log(
  passed === 7
    ? "RESULT: AUTHENTICATION LOGIC PASSED"
    : "RESULT: REVIEW REQUIRED"
);
console.log("Real LIVE credentials used: NO");
console.log("External API calls: NONE");
