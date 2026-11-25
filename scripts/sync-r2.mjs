import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" }); // O .env

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Nawawala ang Supabase credentials sa .env file!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const R2_BUCKET = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_DOMAIN = process.env.VITE_R2_PUBLIC_URL;

async function syncR2ToSupabase() {
  console.log("🔄 Nagsisimula na ang Sync mula Cloudflare R2 papuntang Supabase...\n");

  try {
    // 1. Kunin muna ang mga kasalukuyang video sa Supabase para iwas duplicate
    const { data: existingMedia, error: sbError } = await supabase
      .from("media")
      .select("media_url");

    if (sbError) {
      console.error("❌ Error sa pag-fetch ng Supabase data:", sbError.message);
      return;
    }

    const existingUrls = new Set(existingMedia?.map((m) => m.media_url) || []);

    // 2. I-list ang lahat ng files mula sa Cloudflare R2 Bucket
    const listCommand = new ListObjectsV2Command({ Bucket: R2_BUCKET });
    const r2Response = await s3.send(listCommand);

    const r2Files = r2Response.Contents || [];
    console.log(`📦 Nakakita ng ${r2Files.length} file(s) sa R2 bucket.`);

    let insertedCount = 0;

    for (const file of r2Files) {
      // Laktawan kung folder lang o hindi file
      if (!file.Key || file.Key.endsWith("/")) continue;

      const mediaUrl = `${R2_PUBLIC_DOMAIN}/${file.Key}`;

      // 3. Kapag wala pa sa database, i-insert bilang bagong record
      if (!existingUrls.has(mediaUrl)) {
        // Kunin ang linis na pamagat mula sa filename
        const filename = file.Key.split("/").pop() || file.Key;
        const cleanTitle = filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

        const { error: insertError } = await supabase.from("media").insert([
          {
            title: cleanTitle,
            media_url: mediaUrl,
            category: "Vault Video",
            description: `Auto-synced mula sa R2: ${file.Key}`,
            created_at: file.LastModified || new Date(),
          },
        ]);

        if (insertError) {
          console.error(`❌ Hindi maipasok ang ${file.Key}:`, insertError.message);
        } else {
          console.log(`✅ Na-sync: ${file.Key}`);
          insertedCount++;
        }
      }
    }

    console.log(`\n🎉 Tapos na ang Sync! ${insertedCount} na bagong video(s) ang naidagdag sa Supabase.`);
  } catch (err) {
    console.error("❌ Sync Error:", err);
  }
}

syncR2ToSupabase();