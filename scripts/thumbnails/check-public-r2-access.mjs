/**
 * JB Premium Hub — Phase 317F-3 R2 publisher credential smoke test
 *
 * READ-ONLY:
 * - Lists at most 1 object in dedicated public-assets bucket.
 * - Confirms publisher key cannot list the separate private video bucket.
 * - Does not print keys, API tokens, objects, URLs, or credentials.
 * - Does not upload, delete, download, or change anything.
 *
 * Requires private local .env.local with:
 * R2_ACCOUNT_ID, JB_PUBLIC_R2_ACCESS_KEY_ID, JB_PUBLIC_R2_SECRET_ACCESS_KEY
 */
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const PUBLIC_BUCKET = "jb-collections-public-assets";
const PRIVATE_BUCKET = "jb-collections-hub";

async function main() {
  const { R2_ACCOUNT_ID, JB_PUBLIC_R2_ACCESS_KEY_ID, JB_PUBLIC_R2_SECRET_ACCESS_KEY,
    R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !JB_PUBLIC_R2_ACCESS_KEY_ID || !JB_PUBLIC_R2_SECRET_ACCESS_KEY) {
    throw new Error("Missing public-assets R2 environment variables.");
  }
  if (JB_PUBLIC_R2_ACCESS_KEY_ID === R2_ACCESS_KEY_ID ||
      JB_PUBLIC_R2_SECRET_ACCESS_KEY === R2_SECRET_ACCESS_KEY) {
    throw new Error("Public-assets credentials match the existing source credentials. Use a separate, bucket-scoped public-assets token.");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: "https://" + R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
    credentials: {
      accessKeyId: JB_PUBLIC_R2_ACCESS_KEY_ID,
      secretAccessKey: JB_PUBLIC_R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
    maxAttempts: 2,
  });

  console.log("Phase 317F-3: Public assets credential check (READ ONLY)");
  try {
    // This operation is read-only, cannot upload, overwrite or delete.
    try {
      await client.send(new ListObjectsV2Command({
        Bucket: PUBLIC_BUCKET, Prefix: "thumbnails/", MaxKeys: 1,
      }));
    } catch {
      throw new Error("Public-assets bucket read/list verification FAILED. Check the new token and exact bucket scope.");
    }
    console.log("Public-assets bucket: READ/LIST PASS.");

    // Verify token is not accidentally account-wide.
    let privateIsAccessible = false;
    try {
      await client.send(new ListObjectsV2Command({
        Bucket: PRIVATE_BUCKET, Prefix: "videos/", MaxKeys: 1,
      }));
      privateIsAccessible = true;
    } catch (error) {
      const status = error?.$metadata?.httpStatusCode;
      if (status !== 403 && status !== 404 &&
          !["AccessDenied", "Forbidden", "NoSuchBucket"].includes(error?.name)) {
        throw new Error("Private-scope test inconclusive; public upload remains blocked.");
      }
    }
    if (privateIsAccessible) {
      throw new Error("FAIL: Publisher credentials can access the private-video bucket. Create a strictly public-assets-scoped token.");
    }
    console.log("Private-video bucket: publisher access DENIED (scope PASS).");
    console.log("READ-ONLY R2 access test PASS. No uploads or database changes.");
    console.log("Note: Upload permission is not yet verified; confirm with the 5-image approved publishing gate.");
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  console.error(error?.message || "R2 access test FAILED.");
  process.exitCode = 1;
});
