import assert from "node:assert/strict";
import handler from "../../api/free-preview-url.js";

// All scenarios exercise the fail-closed layer without a Supabase JWT or any
// network, R2, database or production credentials.
function response() {
  return {
    code: 200, body: null, headers: {},
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(value) { this.code = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

const get = response();
await handler({ method: "GET", headers: {} }, get);
assert.equal(get.code, 405);

const crossSite = response();
await handler({
  method: "POST", headers: {
    host: "www.jb-premium-hub.vip", origin: "https://untrusted.example",
  }, body: { media_id: "11111111-1111-4111-8111-111111111111" },
}, crossSite);
assert.equal(crossSite.code, 403);

delete process.env.JB_FREE_PREVIEW_ENABLED;
delete process.env.JB_FREE_PREVIEW_PRIVATE_STORAGE_CONFIRMED;
const disabled = response();
await handler({
  method: "POST", headers: {
    host: "www.jb-premium-hub.vip", origin: "https://www.jb-premium-hub.vip",
  }, body: { media_id: "11111111-1111-4111-8111-111111111111" },
}, disabled);
assert.equal(disabled.code, 503);
assert.equal(disabled.body.error, "Free previews are not enabled");
assert.match(disabled.headers["Cache-Control"], /no-store/);

console.log("PASS: invalid methods and origins rejected; disabled feature fails closed.");
