/**
 * JB Premium Hub - Phase 317E-2
 * Read-only source-bucket layout audit (does not fetch video contents).
 *
 * node --env-file="C:\path\to\.env.local" scripts/thumbnails/audit-bucket-layout.mjs
 *
 * Scans ALL keys in the selected private R2 bucket, including bucket root.
 * Prints only aggregate counts. No URLs, keys, credentials, or file contents
 * are logged; no R2 uploads/deletes and no database operations occur.
 */
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const MAX_OBJECTS = 100000;
const PAGE_SIZE = 1000;
const VIDEO_EXTENSION = /\.(?:mp4|m4v|mov|webm|mkv|avi|mpeg|mpg)$/i;

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
} = process.env;

const bucket =
  process.env.JB_THUMBNAIL_SOURCE_BUCKET ||
  process.env.R2_BUCKET_NAME ||
  "jb-collections-hub";

function makeRow() {
  return { videoObjects: 0, otherObjects: 0, videoMB: 0 };
}

function addToRow(row, isVideo, sizeBytes) {
  if (isVideo) {
    row.videoObjects += 1;
    row.videoMB += sizeBytes / (1024 * 1024);
  } else {
    row.otherObjects += 1;
  }
}

function classifyKey(key) {
  if (!key.includes("/")) return "Bucket Root";
  if (key.startsWith("videos/")) return "videos/";
  return "Other subfolders";
}

async function main() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 credentials are missing in the local environment.");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: "https://" + R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
    maxAttempts: 3,
  });

  const rows = new Map([
    ["Bucket Root", makeRow()],
    ["videos/", makeRow()],
    ["Other subfolders", makeRow()],
  ]);
  const otherPrefixCounts = new Map();
  let nextToken;
  let totalObjects = 0;
  let pages = 0;

  console.log("JB Premium Hub / Phase 317E-2 / READ-ONLY R2 LAYOUT AUDIT");
  console.log("Source bucket:", bucket);
  console.log("Scanning root and subfolders. No video content is being downloaded.");

  try {
    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          MaxKeys: PAGE_SIZE,
          ...(nextToken ? { ContinuationToken: nextToken } : {}),
        })
      );
      pages += 1;
      for (const obj of response.Contents || []) {
        if (typeof obj.Key !== "string" || !obj.Key) continue;
        totalObjects += 1;
        if (totalObjects > MAX_OBJECTS) {
          throw new Error("Object count exceeded safety cap; audit stopped.");
        }
        const category = classifyKey(obj.Key);
        const isVideo = VIDEO_EXTENSION.test(obj.Key) && Number(obj.Size) > 0;
        addToRow(rows.get(category), isVideo, Number(obj.Size) || 0);
        if (category === "Other subfolders" && isVideo) {
          const prefix = obj.Key.split("/")[0] + "/";
          otherPrefixCounts.set(prefix, (otherPrefixCounts.get(prefix) || 0) + 1);
        }
      }
      const oldToken = nextToken;
      nextToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      if (response.IsTruncated && (!nextToken || nextToken === oldToken)) {
        throw new Error("R2 listing did not advance; audit stopped.");
      }
    } while (nextToken);

    console.table(
      [...rows].map(([location, record]) => ({
        location,
        video_objects: record.videoObjects,
        other_objects: record.otherObjects,
        video_size_mb: Number(record.videoMB.toFixed(1)),
      }))
    );
    console.log("Total R2 objects enumerated:", totalObjects);
    console.log("Total list pages:", pages);
    if (otherPrefixCounts.size) {
      console.log("Video objects in other prefixes (top 10):");
      console.table(
        [...otherPrefixCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([prefix, count]) => ({ prefix, videos: count }))
      );
    }
    console.log("Audit complete. No R2 objects or Supabase records were changed.");
    console.log("This only checks the CURRENT bucket, not any other old R2 buckets.");
  } finally {
    client.destroy();
  }
}

main().catch(() => {
  // SDK errors may carry internal connection details. Keep console generic.
  console.error("R2 inventory failed. Check credentials, bucket name and list permission.");
  process.exitCode = 1;
});
