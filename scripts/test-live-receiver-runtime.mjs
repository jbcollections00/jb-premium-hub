
/**
 * JB PREMIUM HUB — PHASE 123J-161
 * LIVE Webhook Receiver Runtime Regression Test
 *
 * COMPLETE REPLACEMENT — EEXIST FIXED
 *
 * Tests the actual receiver using a temporary
 * loopback-only copy and a mock Supabase RPC.
 *
 * NO production secrets.
 * NO production database.
 * NO real PayMongo API calls.
 */

import assert from "node:assert/strict";
import {
  createHmac,
  randomBytes,
} from "node:crypto";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { spawn } from "node:child_process";
import {
  readFile,
  writeFile,
  unlink,
} from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(
  dirname(fileURLToPath(import.meta.url)),
  ".."
);

const originalFile = resolve(
  root,
  "supabase/functions/jb-paymongo-webhook-live/index.ts"
);

const temporaryFile = join(
  dirname(originalFile),
  `.jb-local-runtime-test-${process.pid}.ts`
);

const dummySecret = randomBytes(32).toString("hex");

const ORDER_ID =
  "46797399-aee8-4c58-a432-9abaa8be5fbc";

const EVENT_ID = "evt_LOCALRUNTIME123456";
const SESSION_ID = "cs_LOCALRUNTIME123456";

const PURPOSE =
  "jb_membership_live_manual_checkout";

const PAID_EVENT =
  "checkout_session.payment.paid";

let rpcMode = "queued";
let rpcCalls = 0;
let passed = 0;

let mockServer = null;
let receiver = null;

function listen(server) {
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);

    server.listen(0, "127.0.0.1", () => {
      resolvePromise(server.address().port);
    });
  });
}

async function unusedPort() {
  const server = createNetServer();
  const port = await listen(server);

  await new Promise((done) => {
    server.close(done);
  });

  return port;
}

function fixture() {
  return {
    data: {
      id: EVENT_ID,
      type: "event",
      attributes: {
        type: PAID_EVENT,
        livemode: true,
        data: {
          id: SESSION_ID,
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

function changed(callback) {
  const value = fixture();
  callback(value);
  return value;
}

function signature(raw) {
  const timestamp =
    Math.floor(Date.now() / 1000).toString();

  const digest = createHmac("sha256", dummySecret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");

  return `t=${timestamp},li=${digest}`;
}

async function request(port, body, options = {}) {
  const raw = JSON.stringify(body);

  const headers = {
    "content-type": "application/json",
  };

  if (!options.noSignature) {
    headers["paymongo-signature"] =
      options.invalidSignature
        ? `t=${Math.floor(Date.now() / 1000)},li=${"0".repeat(64)}`
        : signature(raw);
  }

  const response = await fetch(
    `http://127.0.0.1:${port}`,
    {
      method: "POST",
      headers,
      body: raw,
      signal: AbortSignal.timeout(5000),
    }
  );

  return {
    status: response.status,
    data: await response.json(),
  };
}

async function startReceiver(
  port,
  supabasePort,
  enabled
) {
  const source = await readFile(
    originalFile,
    "utf8"
  );

  // Change only the server binding for local testing.
  // The receiver's validation and RPC logic
  // remain unchanged.

  const pattern = /Deno\.serve\(\s*(async\s*\()/;

  assert.match(
    source,
    pattern,
    "Expected Deno.serve handler was not found"
  );

  const localSource = source.replace(
    pattern,
    `Deno.serve({ hostname: "127.0.0.1", port: ${port} }, $1`
  );

  // CREATE ONLY:
  // Prevent accidental overwrite of another file.
  //
  // The temporary copy is removed after each
  // receiver execution.

  await writeFile(
    temporaryFile,
    localSource,
    { flag: "wx" }
  );

  const child = spawn(
    "deno",
    [
      "run",
      "--allow-env",
      "--allow-net",
      temporaryFile,
    ],
    {
      cwd: root,
      env: {
        ...process.env,

        SUPABASE_URL:
          `http://127.0.0.1:${supabasePort}`,

        SUPABASE_SERVICE_ROLE_KEY:
          "LOCAL_DUMMY_SERVICE_ROLE_KEY",

        PAYMONGO_LIVE_WEBHOOK_SECRET:
          dummySecret,

        JB_LIVE_WEBHOOK_RECORDING_ENABLED:
          enabled ? "true" : "false",

        DENO_NO_UPDATE_CHECK: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  let output = "";

  child.stdout.on("data", (part) => {
    output += String(part);
  });

  child.stderr.on("data", (part) => {
    output += String(part);
  });

  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(
        `Receiver exited early:\n${output.slice(-2000)}`
      );
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:${port}`,
        {
          method: "GET",
          signal: AbortSignal.timeout(300),
        }
      );

      if (response.status === 405) {
        return child;
      }
    } catch {
      // The local server is not ready yet.
    }

    await new Promise((done) => {
      setTimeout(done, 150);
    });
  }

  child.kill();

  throw new Error(
    `Local receiver startup failed:\n${output.slice(-2000)}`
  );
}

async function stopReceiver(child) {
  if (!child) return;

  if (child.exitCode !== null) return;

  await new Promise((done) => {
    child.once("exit", done);
    child.kill();
  });
}

async function test(name, run) {
  try {
    await run();
    passed++;

    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    console.error(error.message);

    process.exitCode = 1;
  }
}

async function main() {
  console.log("");

  console.log(
    "JB PREMIUM HUB — LIVE RECEIVER RUNTIME TEST"
  );

  console.log(
    "------------------------------------------"
  );

  mockServer = createServer(async (req, res) => {
    if (
      req.method !== "POST" ||
      req.url !==
        "/rest/v1/rpc/jb_billing_record_enqueue_live_webhook_v1"
    ) {
      res.writeHead(404);
      res.end("{}");
      return;
    }

    let raw = "";

    for await (const chunk of req) {
      raw += chunk;
    }

    let args;

    try {
      args = JSON.parse(raw);
    } catch {
      res.writeHead(400);
      res.end("{}");
      return;
    }

    // Check identifiers received by the
    // mocked database function.

    if (
      args.p_event_id !== EVENT_ID ||
      args.p_session_id !== SESSION_ID ||
      args.p_order_id !== ORDER_ID
    ) {
      res.writeHead(400, {
        "content-type": "application/json",
      });

      res.end(JSON.stringify({
        code: "LOCAL_INVALID_RPC_ARGUMENTS",
        message: "Unexpected RPC identifiers",
      }));

      return;
    }

    rpcCalls++;

    res.setHeader(
      "content-type",
      "application/json"
    );

    if (rpcMode === "error") {
      res.writeHead(500);

      res.end(JSON.stringify({
        code: "LOCAL_SIMULATED_FAILURE",
        message: "Simulated database failure",
      }));

      return;
    }

    res.writeHead(200);

    res.end(JSON.stringify({
      status: rpcMode,
      environment: "live",
      queue_state: "pending",
      settlement_performed: false,
    }));
  });

  const supabasePort = await listen(mockServer);
  const livePort = await unusedPort();

  receiver = await startReceiver(
    livePort,
    supabasePort,
    true
  );

  // TEST 1
  await test(
    "Valid signed LIVE event queued",
    async () => {
      rpcMode = "queued";

      const before = rpcCalls;
      const result = await request(
        livePort,
        fixture()
      );

      assert.equal(result.status, 200);
      assert.equal(result.data.recorded, true);
      assert.equal(result.data.queued, true);
      assert.equal(result.data.duplicate, false);
      assert.equal(rpcCalls, before + 1);
    }
  );

  // TEST 2
  await test(
    "Missing nested livemode accepted",
    async () => {
      rpcMode = "queued";

      const before = rpcCalls;

      const result = await request(
        livePort,
        changed((body) => {
          delete body.data.attributes.data
            .attributes.livemode;
        })
      );

      assert.equal(result.status, 200);
      assert.equal(rpcCalls, before + 1);
    }
  );

  // TEST 3
  await test(
    "Outer TEST mode rejected",
    async () => {
      const before = rpcCalls;

      const result = await request(
        livePort,
        changed((body) => {
          body.data.attributes.livemode = false;
        })
      );

      assert.equal(result.status, 503);
      assert.equal(rpcCalls, before);
    }
  );

  // TEST 4
  await test(
    "Contradictory nested TEST rejected",
    async () => {
      const before = rpcCalls;

      const result = await request(
        livePort,
        changed((body) => {
          body.data.attributes.data
            .attributes.livemode = false;
        })
      );

      assert.equal(result.status, 503);
      assert.equal(rpcCalls, before);
    }
  );

  // TEST 5
  await test(
    "Missing membership purpose rejected",
    async () => {
      const before = rpcCalls;

      const result = await request(
        livePort,
        changed((body) => {
          delete body.data.attributes.data
            .attributes.metadata.purpose;
        })
      );

      assert.equal(result.status, 503);
      assert.equal(rpcCalls, before);
    }
  );

  // TEST 6
  await test(
    "Invalid signature rejected",
    async () => {
      const before = rpcCalls;

      const result = await request(
        livePort,
        fixture(),
        { invalidSignature: true }
      );

      assert.equal(result.status, 401);
      assert.equal(rpcCalls, before);
    }
  );

  // TEST 7
  await test(
    "Missing signature rejected",
    async () => {
      const before = rpcCalls;

      const result = await request(
        livePort,
        fixture(),
        { noSignature: true }
      );

      assert.equal(result.status, 401);
      assert.equal(rpcCalls, before);
    }
  );

  // TEST 8
  await test(
    "Alternate envelope quarantined",
    async () => {
      const before = rpcCalls;

      const result = await request(
        livePort,
        {
          event_type: "send.webhook",
          data: {
            type: PAID_EVENT,
            livemode: true,
            resource: "checkout_session",
            data: fixture().data.attributes.data,
          },
        }
      );

      assert.equal(result.status, 503);
      assert.equal(rpcCalls, before);
    }
  );

  // TEST 9
  await test(
    "Database RPC failure returns 503",
    async () => {
      rpcMode = "error";

      const before = rpcCalls;

      const result = await request(
        livePort,
        fixture()
      );

      assert.equal(result.status, 503);
      assert.equal(rpcCalls, before + 1);
    }
  );

  // TEST 10
  await test(
    "Duplicate RPC response handled",
    async () => {
      rpcMode = "duplicate";

      const result = await request(
        livePort,
        fixture()
      );

      assert.equal(result.status, 200);
      assert.equal(result.data.duplicate, true);

      assert.equal(
        result.data.settlement_performed,
        false
      );
    }
  );

  // TEST 11
  await test(
    "Unrelated signed event ignored",
    async () => {
      const before = rpcCalls;

      const result = await request(
        livePort,
        changed((body) => {
          body.data.attributes.type =
            "payment.refunded";
        })
      );

      assert.equal(result.status, 200);
      assert.equal(result.data.ignored, true);
      assert.equal(rpcCalls, before);
    }
  );

  // Stop the first receiver before the
  // disabled-intake test.

  await stopReceiver(receiver);
  receiver = null;

  // PHASE 123J-161 FIX:
  //
  // Remove the existing temporary test copy.
  // Otherwise writeFile({ flag: "wx" }) fails
  // with EEXIST when startReceiver is called again.

  await unlink(temporaryFile);

  const disabledPort = await unusedPort();

  receiver = await startReceiver(
    disabledPort,
    supabasePort,
    false
  );

  // TEST 12
  await test(
    "Disabled intake returns 503",
    async () => {
      const before = rpcCalls;

      const result = await request(
        disabledPort,
        fixture()
      );

      assert.equal(result.status, 503);

      assert.equal(
        result.data.error,
        "LIVE webhook intake disabled"
      );

      assert.equal(rpcCalls, before);
    }
  );

  console.log(
    "------------------------------------------"
  );

  console.log(`Passed: ${passed}/12`);

  console.log(
    passed === 12
      ? "RESULT: RECEIVER RUNTIME TEST PASSED"
      : "RESULT: REVIEW REQUIRED"
  );

  if (passed !== 12) {
    process.exitCode = 1;
  }

  console.log("Production credentials used: NO");
  console.log("Production database calls: NONE");
  console.log("Real PayMongo API calls: NONE");
}

try {
  await main();
} catch (error) {
  process.exitCode = 1;

  console.error("TEST HARNESS ERROR:");
  console.error(error.message);
} finally {
  await stopReceiver(receiver);

  if (mockServer) {
    await new Promise((done) => {
      mockServer.close(done);
    });
  }

  // Final cleanup even if a test fails.
  await unlink(temporaryFile).catch(() => {});
}
