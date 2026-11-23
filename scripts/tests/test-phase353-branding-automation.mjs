import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceKey, destinationKey, verifyAssetConfig } from "../video-branding/queue-contract.mjs";
const id = "123e4567-e89b-42d3-a456-426614174000";
const owner = "123e4567-e89b-42d3-a456-426614174001";
test("strict private source and output object identity", () => {
  const key = `staging/${owner}/${id}.mp4`;
  assert.equal(sourceKey(id, key), key);
  assert.equal(destinationKey(id, 3), `branding/processed/${id}/v3.mp4`);
  assert.throws(() => sourceKey(id, `staging/${owner}/${owner}.mp4`));
  assert.throws(() => sourceKey(id, `../../${id}.mp4`));
  assert.throws(() => destinationKey(id, 0));
});
test("only activated private branding assets pass", () => {
  const config = {
    version: 2,
    intro: `branding/assets/intro/${id}.mp4`,
    watermark: `branding/assets/watermark/${id}.png`,
    logo: `branding/assets/logo/${id}.png`,
  };
  assert.deepEqual(verifyAssetConfig(config), config);
  assert.throws(() => verifyAssetConfig({ ...config, watermark: "https://example.com/wm.png" }));
  assert.throws(() => verifyAssetConfig({ ...config, version: 0 }));
});
test("cutover forbids unbranded VIP fallback", () => {
  const home = readFileSync("src/pages/public/Home.jsx","utf8");
  const source = readFileSync("src/services/privateMedia.js","utf8");
  const ticket = readFileSync("supabase/functions/jb-private-media-ticket/index.ts","utf8");
  const api = readFileSync("api/jb-branded-download.js","utf8");
  assert.match(home,/videoUrl = await requestBrandedDownloadUrl\(video.id\)/);
  assert.doesNotMatch(home,/requestPrivateMediaUrl\(video.id, "download"\)/);
  assert.match(ticket,/action === "download"/);
  assert.match(ticket,/Use branded-only download service/);
  assert.match(api,/job.status !== "ready"/);
  assert.match(api,/HeadObjectCommand/);
  assert.match(api,/can_download === true/);
  assert.match(source,/requestBrandedDownloadUrl/);
});
test("processing queue is durable, private and drives cleanup on replacement", () => {
  const sql=readFileSync("supabase/migrations/20261123130000_jb_branding_automatic_queue_v1.sql","utf8");
  assert.match(sql,/jb_branding_auto_enqueue_v1/);
  assert.match(sql,/jb_branding_claim_v1/);
  assert.match(sql,/jb_branding_finish_v1/);
  assert.match(sql,/for update of j skip locked/);
  assert.match(sql,/branded_video/);
  assert.match(sql,/on delete cascade/);
  assert.match(sql,/revoke all on public.jb_video_branding_jobs from public,anon,authenticated/);
});
