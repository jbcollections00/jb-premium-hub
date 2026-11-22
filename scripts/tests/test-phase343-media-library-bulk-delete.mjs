import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import stagingHandler from "../../api/jb-admin-staging-upload.js";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261122120000_jb_admin_media_bulk_delete_v1.sql");
const api = read("api/jb-admin-staging-upload.js");
const ui = read("src/pages/admin/AdminMediaTab.jsx");

test("Media Library limits results to 50 per page", () => {
  assert.match(ui, /const itemsPerPage = 50/);
  assert.match(ui, /filteredMedia\.slice\(/);
  assert.match(ui, /itemsPerPage/);
  assert.match(ui, /Page\{" "\}/);
});
test("Responsive 4-column/5-column Media Library uses existing thumbnail cards", () => {
  assert.match(ui, /xl:grid-cols-4 2xl:grid-cols-5/);
  assert.match(ui, /getThumbnailDisplayUrl\(item\.thumbnail_url, item\.id\)/);
});
test("Media selection is restricted to currently visible page and resets on filter or pagination", () => {
  assert.match(ui, /selectedMediaIds/);
  assert.match(ui, /Select current page/);
  assert.match(ui, /aria-label="Select all 50 or fewer videos on this page"/);
  assert.match(ui, /paginatedMedia\.map\(\(item\) => item\.id\)/);
  assert.match(ui, /const visibleIds = new Set\(paginatedMedia\.map/);
  assert.match(ui, /useEffect\(\(\) => \{\s*setSelectedMediaIds\(\[\]\)/);
  assert.match(ui, /\[currentPage, searchQuery, showDuplicatesOnly, activeTab\]/);
});
test("Bulk media deletion has explicit warning and typed deletion confirmation", () => {
  assert.match(ui, /Delete selected \(/);
  assert.match(ui, /window\.confirm\(/);
  assert.match(ui, /window\.prompt\(/);
  assert.match(ui, /DELETE " \+ uniqueIds\.length/);
  assert.match(ui, /selectedMediaIds\.length === 0/);
});
test("No direct media DELETE from primary card action", () => {
  const source = ui.slice(ui.indexOf("const handleDeleteMediaBatch"),ui.indexOf("/* =========================================================\n     AUTO CLEAN DUPLICATES"));
  assert.match(source, /"delete-published-media"/);
  assert.match(source, /supabase\.auth\.getSession\(\)/);
  assert.match(source, /Authorization: "Bearer " \+ sessionResult\.session\.access_token/);
  assert.doesNotMatch(source, /\.from\(["']media["']\)\s*\.delete/);
});
test("Client and server chunk media deletion to avoid R2 timeouts", () => {
  assert.match(ui, /i \+= 10/);
  assert.match(api, /ids\.length > 10/);
  assert.match(api, /new Set\(ids\)\.size !== ids\.length/);
});
test("Server requires admin JWT and explicit confirmation before deletion", () => {
  assert.match(api, /const admin = await getAdmin\(services, token\)/);
  assert.ok(api.indexOf("const admin = await getAdmin(services, token)") <
            api.indexOf('req.body?.action === "delete-published-media"'));
  assert.match(api, /confirmDeletion !== true/);
  assert.match(api, /p_admin_id: admin\.id/);
});
test("Atomic RPC checks database admin role and unique IDs", () => {
  assert.match(sql, /security definer/);
  assert.match(sql, /p_admin_id uuid/);
  assert.match(sql, /from public\.profiles p/);
  assert.match(sql, /v_count > 20/);
  assert.match(sql, /count\(distinct s\.id\)/);
  assert.match(sql, /from public\.media m\s+where m\.id = v_id for update/);
});
test("No browser role can execute destructive RPC", () => {
  assert.match(sql, /revoke all on function public\.jb_admin_delete_published_media_v1\(uuid\[\], uuid\)\s+from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.jb_admin_delete_published_media_v1\(uuid\[\], uuid\)\s+to service_role/);
  assert.match(sql, /alter table public\.jb_admin_media_delete_audit enable row level security/);
  assert.match(sql, /revoke all on table public\.jb_admin_media_delete_audit from public, anon, authenticated/);
});
test("Publication FK, media, and staging deletions occur atomically in RPC", () => {
  assert.match(sql, /delete from public\.jb_media_publication_links/);
  assert.match(sql, /delete from public\.media where id = v_id/);
  assert.match(sql, /delete from public\.jb_media_upload_staging/);
  assert.ok(sql.indexOf("delete from public.jb_media_publication_links") <
            sql.indexOf("delete from public.media where id = v_id"));
});
test("R2 deletion paths are derived only from trusted staging data", () => {
  assert.match(sql, /'staging\/' \|\| v_stage\.created_by/);
  assert.match(sql, /'staging-thumbnails\/' \|\| v_stage\.created_by/);
  assert.match(sql, /is distinct from \('r2:\/\/jb-premium-private-videos\/'/);
  assert.match(api, /new DeleteObjectCommand\(\{\s*Bucket: services\.bucket, Key: key/);
  assert.doesNotMatch(api.slice(api.indexOf("async function deletePublishedMedia")), /req\.body\.video_key/);
});
test("Permanent deletion audit records pending R2 cleanup on failure", () => {
  assert.match(sql, /create table if not exists public\.jb_admin_media_delete_audit/);
  assert.match(sql, /cleanup_status text not null default 'pending'/);
  assert.match(api, /cleanupPending\.push\(row\.deleted_media_id\)/);
  assert.match(api, /legacyStorageUnchanged\.push\(row\.deleted_media_id\)/);
  assert.match(api, /cleanup_status: allCleared \? "complete" : "pending"/);
});
test("Duplicate view trash and clean-extra-copies use the same guarded atomic delete", () => {
  assert.match(ui, /showDuplicatesOnly\s*\? duplicateGroups\.flatMap/);
  assert.match(ui, /const handleAutoCleanDuplicates = async \(\) => \{/);
  assert.match(ui, /await handleDeleteMediaBatch\(ids, true\)/);
  assert.doesNotMatch(ui, /\.from\(\s*["']media["']\s*\)\s*\.delete/);
});

test("No automatic deletion occurs on page load or batch selection", () => {
  const region = ui.slice(ui.indexOf("const handleDeleteMediaBatch"), ui.indexOf("const handleDeleteMedia ="));
  assert.match(region, /if \(!window\.confirm/);
  assert.doesNotMatch(ui, /useEffect\([\s\S]{0,90}handleDeleteMediaBatch/);
});
function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(k,v) { this.headers[k]=v; return this; },
    status(code) { this.statusCode=code; return this; },
    json(body) { this.body=body; return this; },
    end() { return this; },
  };
}
test("Unauthenticated and cross-origin delete requests are rejected", async () => {
  const validOrigin=response();
  await stagingHandler({
    method:"POST",headers:{origin:"https://www.jb-premium-hub.vip"},
    body:{action:"delete-published-media",mediaIds:["4e9c9061-04d7-42ed-ba99-cd25be749276"],confirmDeletion:true},
  },validOrigin);
  assert.equal(validOrigin.statusCode,401);
  const invalidOrigin=response();
  await stagingHandler({
    method:"POST",headers:{origin:"https://attacker.example"},
    body:{action:"delete-published-media",mediaIds:[],confirmDeletion:true},
  },invalidOrigin);
  assert.equal(invalidOrigin.statusCode,403);
});
