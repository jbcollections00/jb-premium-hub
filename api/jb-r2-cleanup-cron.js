// Phase 347: production-only Vercel cron retry endpoint.
// Vercel Cron calls GET with Authorization: Bearer <CRON_SECRET>.
// No browser/admin JWT, query string or user-supplied R2 key can trigger this.
import { timingSafeEqual } from "node:crypto";
import { getCleanupServices, processCleanupJobs } from "./_r2-cleanup.js";

export const config = { maxDuration: 60 };

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (typeof secret !== "string" || secret.length < 32) return false;
  const supplied = String(req.headers.authorization || "");
  const expected = "Bearer " + secret;
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) {
    return res.status(503).json({ error: "CRON_SECRET not configured" });
  }
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });
  const services = getCleanupServices();
  if (!services) return res.status(503).json({ error: "Cleanup infrastructure unavailable" });

  try {
    // Daily on Hobby Vercel; remaining jobs stay safely queued.
    const result = await processCleanupJobs(services, { maxJobs: 20 });
    return res.status(200).json({ ok: true, readOnly: false, ...result });
  } catch (error) {
    console.error("R2 cleanup cron failed:", error?.message || "UNKNOWN");
    return res.status(503).json({ error: "R2 cleanup retry could not finish" });
  }
}
