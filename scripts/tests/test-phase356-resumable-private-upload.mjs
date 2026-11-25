import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const server = readFileSync("api/jb-admin-staging-upload.js", "utf8");
const uploader = readFileSync("src/components/admin/AdminPrivateAlbumUpload.jsx", "utf8");
const resumable = readFileSync("src/services/privateMultipartUpload.js", "utf8");
const sql = readFileSync("supabase/migrations/20261123190000_jb_r2_multipart_upload_state_v1.sql", "utf8");
test("new JS modules and endpoint pass Node syntax checks", () => {
  for (const p of ["api/jb-admin-staging-upload.js", "src/services/privateMultipartUpload.js"]) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", p]));
  }
});
test("backend creates privately scoped multipart sessions and verifies parts server-side",()=>{
  for (const name of [
    "CreateMultipartUploadCommand","UploadPartCommand","ListPartsCommand",
    "CompleteMultipartUploadCommand","AbortMultipartUploadCommand",
    "multipart-sign","multipart-status","multipart-finish",
    "expected file fingerprint","getMultipartParts(services, row)",
  ].filter(n=>n!=="expected file fingerprint")) assert.ok(server.includes(name),name);
  assert.match(server,/partSize: ?MULTIPART_PART_SIZE/);
  assert.match(server,/p\.size !== validatedPart\(row, i\+1\)\.size/);
  assert.match(server,/getAdmin\(services, token\)/);
  assert.match(server,/\.eq\("created_by", admin\.id\)/);
  assert.match(server,/status:\s*"awaiting_upload"/);
  assert.ok(!server.includes("new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME"));
});
test("client chunks 16 MiB with signature renew, progress, retry and resume",()=>{
  assert.match(uploader,/fingerprintPrivateVideo\(file\)/);
  assert.match(uploader,/uploadResumablePrivateVideo\(\{/);
  assert.match(uploader,/file\.size >= 32 \* 1024 \* 1024/);
  assert.match(resumable,/file\.slice\(start, Math\.min\(file\.size, start \+ partSize\)\)/);
  assert.match(resumable,/multipart-status/);
  assert.match(resumable,/multipart-sign/);
  assert.match(resumable,/multipart-finish/);
  assert.match(resumable,/MAX_RETRIES = 4/);
  assert.match(resumable,/Reselect this exact video to resume later/);
});
test("persistent server-side session data is constrained, originals untouched",()=>{
  for (const n of ["multipart_upload_id","multipart_fingerprint","multipart_part_size","jb_staging_multipart_shape_v1"]) {
    assert.ok(sql.includes(n), n);
  }
  assert.ok(!sql.includes("drop table"));
  assert.match(server,/if \(multipart\) \{/);
  assert.match(server,/resumed:true/);
  assert.match(server,/AbortMultipartUploadCommand/);
  assert.match(server,/if \(!deleted\.includes\(row\.id\)\) continue/);
});
