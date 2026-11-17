import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const ui = read("../../src/components/admin/AdminPrivateAlbumUpload.jsx");
const api = read("../../api/jb-admin-staging-upload.js");
test("Admin copy says private/not published instead of prompting repeat review", () => {
  assert.match(ui, /Private · Not published/);
  assert.match(ui, /Files are not public/);
  assert.doesNotMatch(ui, /Private · Pending review|All uploaded videos remain Pending Review|>Pending review</);
});
test("private backend approval boundary and thumbnail authorization remain unchanged", () => {
  assert.match(ui, /finished.status !== "pending_review"/);
  assert.match(ui, /draft.status === "pending_review"/);
  assert.match(api, /status: "pending_review"/);
  assert.match(api, /async function thumbnailPreviews/);
  assert.doesNotMatch(api, /\.from\(["']media["']\)/);
  assert.doesNotMatch(ui, /\.from\(["']media["']\)/);
});
