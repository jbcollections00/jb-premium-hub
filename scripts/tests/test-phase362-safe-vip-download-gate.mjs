// Phase 362: self-contained safe download gate regressions.
// Uses no production credentials and never loads an uploaded media object.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import handler from "../../api/jb-branded-download.js";

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}
function request({ method = "POST", origin = "https://www.jb-premium-hub.vip" } = {}) {
  return {
    method,
    headers: { origin, host: "www.jb-premium-hub.vip" },
    body: { mediaId: "123e4567-e89b-42d3-a456-426614174000" },
  };
}
test("disabled production-style flag fail-closes without issuing a signed download", async () => {
  const previous = process.env.JB_BRANDED_DOWNLOADS_ENABLED;
  try {
    process.env.JB_BRANDED_DOWNLOADS_ENABLED = "false";
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, "Branded downloads not enabled");
    assert.equal(res.headers["Cache-Control"], "no-store");
    assert.equal(res.body.url, undefined);
  } finally {
    if (previous === undefined) delete process.env.JB_BRANDED_DOWNLOADS_ENABLED;
    else process.env.JB_BRANDED_DOWNLOADS_ENABLED = previous;
  }
});
test("download signer rejects unsupported method and disallowed origin", async () => {
  const get = response();
  await handler(request({ method: "GET" }), get);
  assert.equal(get.statusCode, 405);

  const origin = response();
  await handler(request({ origin: "https://untrusted.example" }), origin);
  assert.equal(origin.statusCode, 403);
});
test("signing requires verified VIP/admin, ready branding, and no original fallback", () => {
  const signer = readFileSync(new URL("../../api/jb-branded-download.js", import.meta.url), "utf8");
  const home = readFileSync(new URL("../../src/pages/public/Home.jsx", import.meta.url), "utf8");
  const ticket = readFileSync(new URL("../../supabase/functions/jb-private-media-ticket/index.ts", import.meta.url), "utf8");
  assert.match(signer, /JB_BRANDED_DOWNLOADS_ENABLED\s*!==\s*"true"/);
  assert.match(signer, /can_download === true/);
  assert.match(signer, /job\.status !== "ready"/);
  assert.match(signer, /HeadObjectCommand/);
  assert.match(signer, /ResponseContentDisposition:/);
  assert.match(signer, /expiresIn:\s*90/);
  assert.match(home, /window\.location\.assign\(signedUrl\)/);
  assert.doesNotMatch(home, /requestPrivateMediaUrl\(mediaId, "download"\)/);
  assert.match(ticket, /Use branded-only download service/);
});
