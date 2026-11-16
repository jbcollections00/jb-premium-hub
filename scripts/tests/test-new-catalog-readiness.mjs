import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(
  new URL("../../src/components/admin/NewCatalogReadiness.jsx", import.meta.url),
  "utf8"
);
const mediaTab = readFileSync(
  new URL("../../src/pages/admin/AdminMediaTab.jsx", import.meta.url),
  "utf8"
);

test("new catalog summary is read-only and never extracts video frames", () => {
  assert.match(component, /DEFAULT_THUMBNAIL_URL/);
  assert.match(component, /Automatic video-frame extraction is not enabled/);
  assert.doesNotMatch(component, /createElement\(\s*["']video|canvas\.toBlob|drawImage|\.captureStream\(/);
  assert.doesNotMatch(component, /\.from\(\s*["']media|fetch\s*\(|uploadFileToR2|delete\s*\(/);
});

test("new catalog summary is included in admin upload view", () => {
  assert.match(mediaTab, /import NewCatalogReadiness from/);
  assert.match(mediaTab, /<NewCatalogReadiness\s+existingCount=\{totalMediaCount\}\s+queuedFiles=\{uploadFiles\}/);
});

test("existing manual-cover and default-cover selection remain unchanged", () => {
  assert.match(mediaTab, /const handleThumbnailSelect/);
  assert.match(mediaTab, /let thumbnailUrl = null/);
  assert.match(mediaTab, /if\s*\(\s*fileObj\.thumbnailFile\s*\)/);
  assert.match(mediaTab, /thumbnail_url:\s*thumbnailUrl/);
});
