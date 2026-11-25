import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import handler from "../../api/jb-admin-staging-upload.js";

const read = path => readFileSync(new URL("../../"+path, import.meta.url), "utf8");
const api = read("api/jb-admin-staging-upload.js");
const ui = read("src/components/admin/AdminR2OrphanAudit.jsx");
const manager = read("src/pages/admin/AdminMediaTab.jsx");
const scanner = api.slice(api.indexOf("async function loadAllAuditReferences("),
  api.indexOf("export default async function handler("));

test("Existing admin Private Upload and publishing remain in place with R2 panel", () => {
  assert.match(manager, /<AdminPrivateAlbumUpload \/>/);
  assert.match(manager, /<AdminPublishingReview \/>/);
  assert.match(manager, /<AdminR2OrphanAudit \/>/);
});
test("Scanner is admin-only and authenticates before listing R2", () => {
  assert.match(api, /const admin = await getAdmin\(services, token\)/);
  assert.ok(api.indexOf("const admin = await getAdmin(services, token)") <
            api.indexOf('req.body?.action === "orphan-audit"'));
  assert.match(api, /if \(!admin\) return fail\(res, 403/);
});
test("R2 bucket and prefix cannot be supplied by users", () => {
  assert.match(scanner, /const scopes = \{/);
  assert.match(scanner, /private_video: \{ bucket: services\.bucket, prefix: "staging\/" \}/);
  assert.match(scanner, /private_thumbnail: \{ bucket: services\.bucket, prefix: "staging-thumbnails\/" \}/);
  assert.match(scanner, /scopes\.public_thumbnail = \{ bucket: publicBucket, prefix: "thumbnails\/published\/" \}/);
  assert.match(scanner, /if \(!Object\.hasOwn\(scopes, scope\)\)/);
  assert.doesNotMatch(scanner, /Bucket: req\.body/);
  assert.doesNotMatch(scanner, /Prefix: req\.body/);
});
test("Scanner reads both staging and published media metadata including publication links", () => {
  assert.match(scanner, /"jb_media_upload_staging"/);
  assert.match(scanner, /"media"/);
  assert.match(scanner, /"jb_media_publication_links"/);
  assert.match(scanner, /protectedKeys\.add\(row\.storage_key\)/);
  assert.match(scanner, /protectedKeys\.add\(row\.preview_key\)/);
  assert.match(scanner, /protectedKeys\.add\("thumbnails\/published\/" \+ link\.staging_id/);
});
test("A failed or incomplete DB scan never classifies orphan objects", () => {
  assert.ok(scanner.indexOf("Database reference scan incomplete") <
            scanner.indexOf("new ListObjectsV2Command"));
  assert.match(scanner, /Reference list too large to audit safely/);
  assert.match(scanner, /Reference list incomplete/);
});
test("Only old, unreferenced keys are suspected, never auto-deleted", () => {
  assert.match(scanner, /72 \* 60 \* 60 \* 1000/);
  assert.match(scanner, /protectedKeys\.has\(key\)/);
  assert.match(scanner, /!Number\.isFinite\(timestamp\) \|\| timestamp > ageThreshold/);
  assert.match(scanner, /suspicious\+\+/);
  assert.match(scanner, /classification: "suspected_not_safe_to_delete"/);
  assert.match(scanner, /readOnly: true/);
  assert.doesNotMatch(scanner, /DeleteObjectCommand|PutObjectCommand|\.delete\(\)|\.update\(\)/);
});
test("R2 list is paginated and bounded with strict cursors", () => {
  assert.match(scanner, /MaxKeys: 200/);
  assert.match(scanner, /ContinuationToken: cursor/);
  assert.match(scanner, /cursor\.length > 4096/);
  assert.match(scanner, /IsTruncated/);
  assert.match(scanner, /nextCursor: continuation \|\| null/);
});
test("No clean bill of health on missing list permissions", () => {
  assert.match(scanner, /Unable to list R2 objects\. Verify bucket listing permissions/);
  assert.match(ui, /Unable to complete R2 inventory/);
  assert.match(ui, /Partial scan — do not act on totals/);
});
test("UI explicitly describes audit-only scope and safe partial results", () => {
  assert.match(ui, /Run read-only R2 scan/);
  assert.match(ui, /Read-only: This tool never deletes, modifies, or automatically cleans files/);
  assert.match(ui, /const MAX_PAGES_PER_SCOPE = 30/);
  assert.match(ui, /setReports\(\[\.\.\.completed\]\)/);
  assert.match(ui, /suspectedOrphans/);
  assert.match(ui, /Other buckets and legacy URLs are not audited here/);
});
function response() {
  return {statusCode:200,headers:{},
    setHeader(k,v){this.headers[k]=v;return this;},
    status(n){this.statusCode=n;return this;},
    json(body){this.body=body;return this;},
    end(){return this;},
  };
}
test("Unauthenticated calls and attacker origins rejected before R2 access", async () => {
  const noauth=response();
  await handler({method:"POST",
    headers:{origin:"https://www.jb-premium-hub.vip"},
    body:{action:"orphan-audit",scope:"private_video"}},noauth);
  assert.equal(noauth.statusCode,401);
  const attacker=response();
  await handler({method:"POST",
    headers:{origin:"https://untrusted.example"},
    body:{action:"orphan-audit",scope:"private_video"}},attacker);
  assert.equal(attacker.statusCode,403);
});

test("public audit configuration failures identify the missing flag and do not claim zero orphans", () => {
  assert.match(scanner, /scope === "public_thumbnail" && !scopes\.public_thumbnail/);
  assert.match(scanner, /if \(!publicBucket\)/);
  assert.match(scanner, /JB_PUBLIC_THUMBNAIL_R2_BUCKET_NAME in Vercel Production/);
  assert.match(scanner, /JB_PUBLIC_THUMBNAIL_ORIGIN to https:\/\/assets\.jb-premium-hub\.vip/);
  assert.match(scanner, /public thumbnail bucket must be different from the private video bucket/);
  assert.match(scanner, /return fail\(res, 409/);
  assert.ok(scanner.indexOf("if (scope === \"public_thumbnail\" && !scopes.public_thumbnail)") <
    scanner.indexOf("new ListObjectsV2Command"));
});
