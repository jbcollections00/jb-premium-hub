/**
 * Read-only diagnostic for the first failing step in album RLS verification.
 * No login, passwords, album titles, media data, or storage actions.
 */
import { createClient } from "@supabase/supabase-js";
import { supabase as project } from "../../src/services/supabaseClient.js";

const client = createClient(project.supabaseUrl, project.supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const classify = (error) => {
  const combined = [
    error?.message,
    error?.details,
    error?.hint,
    error?.cause?.message,
  ].filter(Boolean).join(" ");
  if (/fetch failed|network|enotfound|econnreset|etimedout|certificate|self.signed|tls|failed to fetch|dns/i.test(combined)) {
    return "NETWORK_OR_NODE_TLS";
  }
  if (error?.code === "42501" || /permission denied|not authorized|not authenticated|insufficient privilege/i.test(combined)) {
    return "RLS_OR_SELECT_PERMISSION_DENIED";
  }
  if (error?.code === "42P01" || /relation .* does not exist|not found/i.test(combined)) {
    return "TABLE_NOT_FOUND";
  }
  if (error?.code === "PGRST301" || /jwt.*invalid|apikey.*invalid/i.test(combined)) {
    return "AUTH_CLIENT_CONFIGURATION";
  }
  return "OTHER_SUPABASE_ERROR";
};

try {
  const { count, error } = await client
    .from("jb_media_albums")
    .select("id", { head: true, count: "exact" });

  if (error) {
    const reason = classify(error);
    console.log("ANONYMOUS SELECT: " + reason);
    console.log("Error code: " + (error.code || "none"));
    console.log("HTTP status: " + (error.status ?? "unavailable"));
    if (reason === "RLS_OR_SELECT_PERMISSION_DENIED") {
      console.log("EXPECTED: Anonymous read was denied by the database.");
    } else if (reason === "NETWORK_OR_NODE_TLS") {
      console.log("Node cannot reach Supabase reliably. Browser access and Node network access may differ.");
      process.exitCode = 1;
    } else {
      console.log("Unexpected API result; do not change RLS or membership settings yet.");
      process.exitCode = 1;
    }
  } else if (count === 0) {
    console.log("ANONYMOUS SELECT: PASS (0 visible album rows)");
  } else {
    console.log("ANONYMOUS SELECT: FAIL (unexpected visible rows: " + count + ")");
    process.exitCode = 1;
  }
} catch (error) {
  console.log("ANONYMOUS SELECT: " + classify(error));
  console.log("Request threw before a usable Supabase response. No database changes were made.");
  process.exitCode = 1;
}
