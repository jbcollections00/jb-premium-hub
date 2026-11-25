/**
 * JB PayMongo Step 37 -- offline behavioral regression of the actual LIVE receiver.
 * This script loads the checked-in TypeScript source in a locked-down Node VM.
 * Supabase is mocked. No PayMongo, Supabase or other external network access.
 * CI-only synthetic signing key; never use a real webhook secret.
 */
import assert from 'node:assert/strict';
import { createHmac, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const receiverFile = new URL('../../supabase/functions/jb-paymongo-webhook-live/index.ts', import.meta.url);
const source = readFileSync(receiverFile, 'utf8');
const importPattern = /import\s*\{\s*createClient\s*,?\s*\}\s*from\s*["']npm:@supabase\/supabase-js@2["'];/;
assert.match(source, importPattern, 'Expected Supabase import missing; review test harness');
assert.match(source, /Deno\.serve\(/, 'Expected Deno.serve missing; review test harness');
const instrumented = source
  .replace(importPattern, 'const createClient = (...args) => globalThis.__mockClient(...args);')
  .replace('Deno.serve(', 'globalThis.__registerHandler(');
const script = stripTypeScriptTypes(instrumented);

const syntheticSecret = 'CI_ONLY_FAKE_WEBHOOK_SECRET_DO_NOT_DEPLOY';
const env = {
  JB_LIVE_WEBHOOK_RECORDING_ENABLED: 'true',
  PAYMONGO_LIVE_WEBHOOK_SECRET: syntheticSecret,
  SUPABASE_URL: 'https://isolated.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'CI_ONLY_FAKE_SERVICE_ROLE_KEY',
};
let handler;
let nextRpc = { data: { status: 'queued' }, error: null };
let rpcCalls = [];
let clientCount = 0;
const sandbox = {
  Request, Response, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
  crypto: webcrypto,
  console: {
    error: () => {}, // expected negative-case errors are intentionally suppressed
    log: () => {},
  },
  Deno: { env: { get: (name) => env[name] } },
  __registerHandler: (fn) => { assert.equal(handler, undefined); handler = fn; },
  __mockClient: () => {
    clientCount++;
    return {
      rpc: async (name, params) => {
        rpcCalls.push({ name, params });
        return nextRpc;
      },
    };
  },
  fetch: () => { throw new Error('NETWORK_FORBIDDEN'); },
};
sandbox.globalThis = sandbox;
runInNewContext(script, sandbox, { filename: receiverFile.pathname, timeout: 3000 });
assert.equal(typeof handler, 'function', 'LIVE receiver handler not captured');

const orderId = '7c41b2e5-71d1-41d9-8a39-7e1e320fbdc4';
const sessionId = 'cs_ci_checkout_001';
const eventId = 'evt_ci_event_000001';
function event({purpose='jb_membership_live_manual_checkout', live=true, order=orderId, session=sessionId, id=eventId, nestedLive=undefined}={}) {
  const attributes = {
    reference_number: order,
    metadata: { order_id: order, user_id: '4dce9c0f-b162-4f33-bcf2-cc7d47d53861', purpose },
  };
  if (nestedLive !== undefined) attributes.livemode = nestedLive;
  return {data:{id, type:'event', attributes:{type:'checkout_session.payment.paid', livemode:live,
    data:{id:session, type:'checkout_session', attributes}}}};
}
function sign(body, timestamp) {
  return createHmac('sha256', syntheticSecret).update(`${timestamp}.${body}`).digest('hex');
}
async function deliver(payload, {signWith='good', timestamp=String(Math.floor(Date.now()/1000))}={}) {
  rpcCalls = [];
  clientCount = 0;
  const body = JSON.stringify(payload);
  const signature = sign(body, timestamp);
  const suppliedSignature = signWith === 'bad' ? '0'.repeat(64) : signature;
  const response = await handler(new Request('https://isolated.invalid/webhook', {
    method: 'POST', headers: { 'content-type':'application/json',
      'paymongo-signature':`t=${timestamp},li=${suppliedSignature}` }, body,
  }));
  const json = await response.json();
  return {status:response.status, json, calls:rpcCalls, clientCount};
}
let passed = 0;
async function check(label, fn) {
  try { await fn(); passed++; console.log(`PASS ${String(passed).padStart(2,'0')} ${label}`); }
  catch (e) { console.error(`FAIL ${label}: ${e.message}`); process.exitCode = 1; }
}

await check('valid HMAC + LIVE event enqueues exactly once', async () => {
  nextRpc = {data:{status:'queued'}, error:null};
  const a = await deliver(event());
  assert.equal(a.status,200);
  assert.equal(a.json.recorded,true);
  assert.equal(a.json.settlement_performed,false);
  assert.equal(a.calls.length,1);
  assert.equal(a.calls[0].name,'jb_billing_record_enqueue_live_webhook_v1');
  assert.deepEqual(JSON.parse(JSON.stringify(a.calls[0].params)),{
    p_event_id:eventId, p_session_id:sessionId, p_order_id:orderId,
  });
});
await check('idempotent duplicate is acknowledged without settlement', async () => {
  nextRpc = {data:{status:'duplicate'},error:null};
  const a = await deliver(event());
  assert.equal(a.status,200);
  assert.equal(a.json.duplicate,true);
  assert.equal(a.calls.length,1);
});
await check('invalid signature rejected before DB access', async () => {
  const a = await deliver(event(),{signWith:'bad'});
  assert.equal(a.status,401);assert.equal(a.calls.length,0);assert.equal(a.clientCount,0);
});
await check('old signed request rejected (replay defense)', async () => {
  const a = await deliver(event(),{timestamp:String(Math.floor(Date.now()/1000)-900)});
  assert.equal(a.status,401);assert.equal(a.calls.length,0);
});
await check('TEST event rejected by LIVE receiver', async () => {
  const a = await deliver(event({live:false}));
  assert.equal(a.status,503);assert.equal(a.calls.length,0);
});
await check('contradictory nested livemode rejected', async () => {
  const a = await deliver(event({nestedLive:false}));
  assert.equal(a.status,503);assert.equal(a.calls.length,0);
});
await check('signed foreign-purpose LIVE event ignored safely', async () => {
  const a = await deliver(event({purpose:'other_merchant_application'}));
  assert.equal(a.status,200);assert.equal(a.json.reason,'foreign_purpose');
  assert.equal(a.calls.length,0);
});
await check('signed ambiguous purpose fails closed', async () => {
  const a = await deliver(event({purpose:''}));
  assert.equal(a.status,503);assert.equal(a.calls.length,0);
});
await check('signed mismatched reference/order metadata fails closed', async () => {
  const a = await deliver(event({order:'invalid-reference'}));
  assert.equal(a.status,503);assert.equal(a.calls.length,0);
});
await check('signed malformed session ID fails closed', async () => {
  const a = await deliver(event({session:'bad-session'}));
  assert.equal(a.status,503);assert.equal(a.calls.length,0);
});
await check('alternate send.webhook without genuine evt ID fails closed', async () => {
  const e=event();
  const alternative={event_type:'send.webhook', data:{type:'checkout_session.payment.paid',attributes:e.data.attributes.data.attributes}};
  const a = await deliver(alternative);
  assert.equal(a.status,503);assert.equal(a.calls.length,0);
});
await check('bare paid LIVE checkout session with matching purpose is NOT silently acknowledged', async () => {
  const attrs=event().data.attributes.data.attributes;
  const bare={id:sessionId,type:'checkout_session',attributes:{...attrs,livemode:true,
    payments:[{id:'pay_ci_synthetic_0001',type:'payment',attributes:{status:'paid',livemode:true}}]}};
  const a=await deliver(bare);
  // No evt_ ID means no trusted idempotency identifier. Must require review / retry, never ACK ignored.
  assert.equal(a.status,503);assert.equal(a.calls.length,0);
});
await check('DB queue failure returns retryable 503', async () => {
  nextRpc={data:null,error:{code:'CI_SYNTHETIC_DB_ERROR'}};
  const a=await deliver(event());
  assert.equal(a.status,503);assert.equal(a.calls.length,1);
});
await check('disabled switch prevents DB client construction', async () => {
  env.JB_LIVE_WEBHOOK_RECORDING_ENABLED='false';
  const a=await deliver(event());
  assert.equal(a.status,503);assert.equal(a.calls.length,0);assert.equal(a.clientCount,0);
  env.JB_LIVE_WEBHOOK_RECORDING_ENABLED='true';
});

if (process.exitCode) {
  console.error(`FAIL: ${passed} checks passed; at least one regression found. Release remains blocked.`);
} else {
  console.log(`PASS: all ${passed} checks passed against checked-in LIVE receiver (offline only).`);
}
