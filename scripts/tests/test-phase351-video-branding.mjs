import test from "node:test";
import assert from "node:assert/strict";
import { canvasSize, cleanThumbnailPositions, introFilter, mainFilter } from "../video-branding/filters.mjs";

test("preserves portrait and landscape orientation", () => {
  assert.deepEqual(canvasSize(1080, 1920), { width: 1080, height: 1920 });
  assert.deepEqual(canvasSize(1920, 1080), { width: 1920, height: 1080 });
  assert.deepEqual(canvasSize(721, 1281), { width: 720, height: 1280 });
});
test("intro has no watermark or logo overlay", () => {
  const text = introFilter({ width: 1080, height: 1920 });
  assert.doesNotMatch(text, /overlay|colorchannelmixer/);
  assert.match(text, /pad=1080:1920/);
});
test("main overlay stays within video canvas and logo in lower-right", () => {
  const text = mainFilter({ width: 1080, height: 1920 });
  assert.match(text, /abs\(mod\(t\*/);
  assert.match(text, /W-w-/);
  assert.match(text, /H-h-/);
  assert.match(text, /colorchannelmixer=aa=0.3/);
  assert.match(text, /\[vout\]/);
});
test("clean thumbnail positions come from the unbranded main, just after its start", () => {
  assert.deepEqual(cleanThumbnailPositions(10, false), [0.25]);
  assert.deepEqual(cleanThumbnailPositions(10, true), [0.25, 1.25, 2.25]);
  assert.deepEqual(cleanThumbnailPositions(0.5, true), [0.25, 0.4, 0.4]);
});
test("invalid inputs fail closed", () => {
  assert.throws(() => mainFilter({ width: 1080, height: 1920, opacity: 3 }));
  assert.throws(() => canvasSize(0, 720));
  assert.throws(() => cleanThumbnailPositions(0, false));
});
