
/**
 * JB PREMIUM HUB — PHASE 123J-159
 *
 * LIVE PayMongo Webhook Parser Compatibility
 *
 * LOCAL TEST ONLY
 * No real credentials.
 * No API calls.
 * No database writes.
 *
 * Tests a proposed strict parser contract.
 * Does not prove deployed receiver compatibility.
 */

import assert from "node:assert/strict";

const PAID_EVENT = "checkout_session.payment.paid";

const EVENT_ID = /^evt_[A-Za-z0-9_-]{6,200}$/;
const SESSION_ID = /^cs_[A-Za-z0-9_-]{6,200}$/;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PURPOSE = "jb_membership_live_manual_checkout";

const ORDER_ID =
  "46797399-aee8-4c58-a432-9abaa8be5fbc";

const SESSION = "cs_EXAMPLE123456";
const EVENT = "evt_EXAMPLE123456";

function isObject(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

/**
 * Pure parser contract.
 *
 * Signature verification must happen independently
 * BEFORE calling this parser in a real receiver.
 *
 * 'accepted' means suitable for passing identifiers
 * to the existing LIVE queue RPC, not payment proof.
 */
function parseLiveEvent(body) {
  if (!isObject(body) || !isObject(body.data)) {
    return { status: "rejected" };
  }

  const event = body.data;

  // Modern PayMongo event envelope.
  if (event.type === "event") {
    if (!isObject(event.attributes)) {
      return { status: "rejected" };
    }

    const attributes = event.attributes;

    if (attributes.type !== PAID_EVENT) {
      return { status: "ignored" };
    }

    if (
      typeof event.id !== "string" ||
      !EVENT_ID.test(event.id) ||
      attributes.livemode !== true
    ) {
      return { status: "rejected" };
    }

    const session = attributes.data;

    if (
      !isObject(session) ||
      session.type !== "checkout_session" ||
      typeof session.id !== "string" ||
      !SESSION_ID.test(session.id) ||
      !isObject(session.attributes)
    ) {
      return { status: "rejected" };
    }

    const details = session.attributes;

    // Do not reject solely because nested
    // livemode is absent: outer event is LIVE.
    // Reject an explicitly contradictory value.
    if (
      details.livemode !== undefined &&
      details.livemode !== true
    ) {
      return { status: "rejected" };
    }

    if (
      typeof details.reference_number !== "string" ||
      !UUID.test(details.reference_number) ||
      !isObject(details.metadata) ||
      details.metadata.order_id !==
        details.reference_number ||
      details.metadata.purpose !== PURPOSE
    ) {
      return { status: "rejected" };
    }

    return {
      status: "accepted",
      eventId: event.id,
      sessionId: session.id,
      orderId: details.reference_number,
    };
  }

  // Alternate envelope has no guaranteed
  // provider event ID under this contract.
  //
  // Do not fabricate evt_ IDs.
  // Do not enqueue without verified identity.
  if (
    body.event_type === "send.webhook" &&
    event.type === PAID_EVENT
  ) {
    return { status: "unsupported_envelope" };
  }

  return { status: "rejected" };
}

function modernEvent() {
  return {
    data: {
      id: EVENT,
      type: "event",
      attributes: {
        type: PAID_EVENT,
        livemode: true,
        data: {
          id: SESSION,
          type: "checkout_session",
          attributes: {
            livemode: true,
            reference_number: ORDER_ID,
            metadata: {
              order_id: ORDER_ID,
              purpose: PURPOSE,
            },
          },
        },
      },
    },
  };
}

function changeEvent(change) {
  const body = modernEvent();
  change(body);
  return body;
}

const alternateEvent = {
  event_type: "send.webhook",
  data: {
    type: PAID_EVENT,
    resource: "checkout_session",
    livemode: true,
    data: modernEvent().data.attributes.data,
  },
};

const tests = [
  {
    name: "Valid modern LIVE event",
    body: modernEvent(),
    expected: "accepted",
  },
  {
    name: "Modern event without nested livemode",
    body: changeEvent((b) => {
      delete b.data.attributes.data.attributes.livemode;
    }),
    expected: "accepted",
  },
  {
    name: "Reject TEST outer environment",
    body: changeEvent((b) => {
      b.data.attributes.livemode = false;
    }),
    expected: "rejected",
  },
  {
    name: "Reject conflicting nested TEST environment",
    body: changeEvent((b) => {
      b.data.attributes.data.attributes.livemode = false;
    }),
    expected: "rejected",
  },
  {
    name: "Reject missing Event ID",
    body: changeEvent((b) => {
      delete b.data.id;
    }),
    expected: "rejected",
  },
  {
    name: "Reject invalid Event ID",
    body: changeEvent((b) => {
      b.data.id = SESSION;
    }),
    expected: "rejected",
  },
  {
    name: "Reject mismatched order metadata",
    body: changeEvent((b) => {
      b.data.attributes.data.attributes.metadata.order_id =
        "2486ff05-1111-4111-8111-111111111111";
    }),
    expected: "rejected",
  },
  {
    name: "Reject missing membership purpose",
    body: changeEvent((b) => {
      delete b.data.attributes.data.attributes.metadata.purpose;
    }),
    expected: "rejected",
  },
  {
    name: "Reject incorrect membership purpose",
    body: changeEvent((b) => {
      b.data.attributes.data.attributes.metadata.purpose =
        "unrelated_payment";
    }),
    expected: "rejected",
  },
  {
    name: "Reject missing checkout session ID",
    body: changeEvent((b) => {
      delete b.data.attributes.data.id;
    }),
    expected: "rejected",
  },
  {
    name: "Ignore unrelated modern event",
    body: changeEvent((b) => {
      b.data.attributes.type = "payment.refunded";
    }),
    expected: "ignored",
  },
  {
    name: "Quarantine alternate signed event envelope",
    body: alternateEvent,
    expected: "unsupported_envelope",
  },
  {
    name: "Reject malformed event body",
    body: { data: null },
    expected: "rejected",
  },
];

let passed = 0;

console.log("");
console.log("JB PREMIUM HUB — LIVE WEBHOOK PARSER TEST");
console.log("------------------------------------------");

for (const test of tests) {
  try {
    const result = parseLiveEvent(test.body);

    assert.equal(result.status, test.expected);

    if (result.status === "accepted") {
      assert.equal(result.eventId, EVENT);
      assert.equal(result.sessionId, SESSION);
      assert.equal(result.orderId, ORDER_ID);
    }

    console.log(`PASS: ${test.name}`);
    passed++;
  } catch (error) {
    console.error(`FAIL: ${test.name}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

console.log("------------------------------------------");
console.log(`Passed: ${passed}/${tests.length}`);

if (passed === tests.length) {
  console.log("RESULT: PARSER CONTRACT TEST PASSED");
} else {
  console.log("RESULT: REVIEW REQUIRED");
}

console.log("Real LIVE credentials used: NO");
console.log("External API calls: NONE");
console.log("Database operations: NONE");
console.log("LIVE payment processing: NONE");
