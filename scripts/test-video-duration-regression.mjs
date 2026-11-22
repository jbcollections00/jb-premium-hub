// Phase 336AU: synthetic behavior checks for the REAL PR player metadata handler.
// No Supabase credentials, external requests, or video downloads required.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/components/VIPVideoPlayer.jsx", import.meta.url), "utf8");
const startTag = "  const handleLoadedMetadata = async (e) => {";
const endTag = "\n  const handleVideoPlay = async () => {";
const start = source.indexOf(startTag);
const end = source.indexOf(endTag, start);
assert.ok(start !== -1 && end > start, "metadata handler must exist and be extractable");
const snippet = source.slice(start, end);
assert.ok(!snippet.includes("supabase.rpc("), "metadata handler must not call privileged RPC");
assert.ok(snippet.includes('.from("media")'), "persisting duration must use RLS");
assert.ok(source.includes("src={videoSrc}"), "video source binding must remain present");

function makeCase({ role = "standard", duration = 20, currentDuration = 0, accountType, dbError = null, matchMedia = true } = {}) {
  const calls = { db: [], updates: [], errors: [], state: {} };
  const mediaId = "b93f441c-f88d-4bc6-93a9-b808f9296764";
  const mainVideoUrl = "https://example.invalid/v/secure-playback";
  const hasSavedDurationRef = { current: false };
  const chain = {
    update(record) { calls.db.push(["update", record.duration]); return this; },
    eq(field, value) { calls.db.push(["eq", field, value]); return this; },
    or(value) { calls.db.push(["or", value]); return this; },
    select(columns) { calls.db.push(["select", columns]); return this; },
    async maybeSingle() {
      calls.db.push(["maybeSingle"]);
      return dbError
        ? { data: null, error: dbError }
        : { data: { id: mediaId }, error: null };
    }
  };
  const context = {
    mediaId, mainVideoUrl, currentDuration,
    userProfile: { role, account_type: role },
    accountType: accountType || role,
    hasSavedDurationRef,
    currentMediaIdRef: { current: matchMedia ? mediaId : "different-media" },
    currentVideoUrlRef: { current: mainVideoUrl },
    setIsSeekReady(value) { calls.state.seekReady = value; },
    setPlaybackDuration(value) { calls.state.duration = value; },
    setPlaybackTime(value) { calls.state.time = value; },
    onDurationUpdate(id, seconds) { calls.updates.push({ id, seconds }); },
    supabase: {
      from(table) {
        calls.db.push(["from", table]);
        return chain;
      },
      rpc() { throw new Error("Privileged duration RPC must never be called"); }
    },
    console: { error(...args) { calls.errors.push(args.map(String).join(" ")); } }
  };
  const handleLoadedMetadata = vm.runInNewContext(
    snippet + "\nhandleLoadedMetadata", context,
    { timeout: 1000, filename: "VIPVideoPlayer.jsx:handleLoadedMetadata" }
  );
  return {
    calls, hasSavedDurationRef,
    invoke(time = 1) {
      return handleLoadedMetadata({ currentTarget: { duration, currentTime: time } });
    }
  };
}

for (const role of ["free", "standard", "vip"]) {
  test(role + " displays video duration without any DB write", async () => {
    const t = makeCase({ role });
    await t.invoke(2);
    assert.equal(t.calls.state.seekReady, true);
    assert.equal(t.calls.state.duration, 20);
    assert.equal(t.calls.state.time, 2);
    assert.equal(t.calls.db.length, 0);
    assert.equal(t.calls.updates.length, 0);
  });
}

test("admin updates only missing duration through RLS, once", async () => {
  const t = makeCase({ role: "admin" });
  await t.invoke();
  await t.invoke();
  assert.deepEqual(t.calls.db.map(c => c[0]), ["from", "update", "eq", "or", "select", "maybeSingle"]);
  assert.equal(t.calls.db[0][1], "media");
  assert.equal(t.calls.db[1][1], 20);
  assert.equal(t.calls.db[3][1], "duration.is.null,duration.eq.0");
  assert.equal(t.calls.updates.length, 1);
  assert.equal(t.calls.updates[0].seconds, 20);
  assert.equal(t.hasSavedDurationRef.current, true);
});

test("admin does not overwrite an existing duration", async () => {
  const t = makeCase({ role: "admin", currentDuration: 20 });
  await t.invoke();
  assert.equal(t.calls.db.length, 0);
});

for (const duration of [0, Number.NaN, Infinity, 86401]) {
  test("admin rejects invalid duration " + String(duration), async () => {
    const t = makeCase({ role: "admin", duration });
    await t.invoke();
    assert.equal(t.calls.db.length, 0);
  });
}

test("admin DB errors do not break UI metadata and reset retry flag", async () => {
  const t = makeCase({ role: "admin", dbError: { message: "denied" } });
  await t.invoke();
  assert.equal(t.calls.state.duration, 20);
  assert.equal(t.calls.errors.length, 1);
  assert.equal(t.hasSavedDurationRef.current, false);
});

test("stale response never updates another selected video", async () => {
  const t = makeCase({ role: "admin", matchMedia: false });
  await t.invoke();
  assert.equal(t.calls.updates.length, 0);
});

test("admin duration update uses existing user-scoped RLS, not service role", () => {
  assert.ok(!snippet.includes("service_role"));
  assert.ok(!snippet.includes("SUPABASE_SERVICE_ROLE_KEY"));
});
