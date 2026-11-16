import test from "node:test";
import assert from "node:assert/strict";
import {
  canOmitPublicTitle,
  isTitlelessForVerifiedId,
  videoThumbnailAlt,
} from "../../src/services/verifiedTitlelessPresentation.js";

const safeId = "f4dd4f6f-357a-4c82-9ae0-61bd06b84a9f";
const signedApprovedIds = new Set([safeId]);

test("production policy defaults to fail closed", () => {
  assert.equal(canOmitPublicTitle(safeId, false), false);
  assert.equal(canOmitPublicTitle("unverified", false), false);
});
test("reviewed ID can use titleless public card presentation", () => {
  assert.equal(isTitlelessForVerifiedId(safeId, false, signedApprovedIds), true);
});
test("admins still see original titles for reviewed ID", () => {
  assert.equal(isTitlelessForVerifiedId(safeId, true, signedApprovedIds), false);
});
test("any unverified ID retains visible title regardless of item flags", () => {
  assert.equal(isTitlelessForVerifiedId("unverified", false, signedApprovedIds), false);
  assert.equal(canOmitPublicTitle("unverified", false), false);
});
test("existing cover retains original alt metadata by default", () => {
  assert.equal(videoThumbnailAlt({
    id: safeId,
    title: "Example video",
    thumbnail_url: "https://assets.example.org/cover.jpg",
    verified_content: true,
  }), "Example video");
});
test("missing thumbnail retains JB Collections fallback alt", () => {
  assert.equal(videoThumbnailAlt({
    id: "unverified", title: "Example video", thumbnail_url: null,
  }), "JB Collections");
});
