import test from "node:test";
import assert from "node:assert/strict";
import {
  captureTimes, portraitOrientation, INTRO_SKIP_SECONDS,
} from "./batch-rules.mjs";

test("landscape captures once, strictly after the 22-second intro", () => {
  assert.equal(INTRO_SKIP_SECONDS, 23);
  assert.deepEqual(captureTimes(67.767, false), [23]);
});

test("portrait merges three well-spaced post-intro timestamps", () => {
  assert.deepEqual(captureTimes(67.767, true), [23, 44.134, 66.267]);
});

test("short videos skip rather than expose intro frames", () => {
  assert.equal(captureTimes(21, false), null);
  assert.equal(captureTimes(23, false), null);
  assert.equal(captureTimes(25, true), null);
  assert.deepEqual(captureTimes(24.5, false), [23]);
});

test("portrait and rotated-video orientation", () => {
  assert.equal(portraitOrientation({ width: 1080, height: 1920 }), true);
  assert.equal(portraitOrientation({ width: 1920, height: 1080 }), false);
  assert.equal(portraitOrientation({
    width: 1920, height: 1080, tags: { rotate: "90" },
  }), true);
  assert.equal(portraitOrientation({
    width: 1080, height: 1920, side_data_list: [{ rotation: -90 }],
  }), false);
});
