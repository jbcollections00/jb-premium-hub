/**
 * Read-only member album RLS smoke check against actual Supabase Auth sessions.
 *
 * REQUIRED local test credentials (never commit or paste them in chat):
 *   JB_TEST_FREE_EMAIL / JB_TEST_FREE_PASSWORD
 *   JB_TEST_MEMBER_EMAIL / JB_TEST_MEMBER_PASSWORD
 *
 * This script reads counts only (no titles, private video URLs, or user data)
 * and does not modify accounts, album rows, R2, or media records.
 */
import { createClient } from "@supabase/supabase-js";
import { supabase as projectClient } from "../../src/services/supabaseClient.js";

const ALBUMS_TABLE = "jb_media_albums";
const PUBLIC_URL = projectClient.supabaseUrl;
const PUBLIC_ANON_KEY = projectClient.supabaseKey;
const required = [
  "JB_TEST_FREE_EMAIL",
  "JB_TEST_FREE_PASSWORD",
  "JB_TEST_MEMBER_EMAIL",
  "JB_TEST_MEMBER_PASSWORD",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error("MISSING LOCAL TEST CREDENTIALS. Provide two separate real test accounts:");
  console.error("  FREE: JB_TEST_FREE_EMAIL / JB_TEST_FREE_PASSWORD");
  console.error("  STANDARD/VIP: JB_TEST_MEMBER_EMAIL / JB_TEST_MEMBER_PASSWORD");
  console.error("Use temporary PowerShell environment variables. Do not paste passwords into chat or commit them.");
  process.exitCode = 2;
} else if (
  !PUBLIC_URL?.startsWith("https://") ||
  !PUBLIC_ANON_KEY ||
  process.env.JB_TEST_FREE_EMAIL.toLowerCase() === process.env.JB_TEST_MEMBER_EMAIL.toLowerCase()
) {
  console.error("INVALID SETUP: Need two different test users and a valid public Supabase client.");
  process.exitCode = 2;
} else {
  const createScopedClient = () => createClient(PUBLIC_URL, PUBLIC_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const getAlbumCount = async (client, allowDenied = false) => {
    const { count, error } = await client
      .from(ALBUMS_TABLE)
      .select("id", { count: "exact", head: true });
    // The anonymous role has SELECT revoked: a permission-denied response
    // is a valid PASS. Other errors (missing table/network/failed RLS)
    // must never be counted as a successful access-control test.
    if (error) {
      if (allowDenied && error.code === "42501") return 0;
      throw new Error("Album SELECT failed: " + (error.code || "UNKNOWN"));
    }
    if (!Number.isInteger(count)) throw new Error("Supabase returned no album count");
    return count;
  };

  const results = [];

  const checkAnon = async () => {
    const client = createScopedClient();
    const count = await getAlbumCount(client, true);
    const passed = count === 0;
    results.push({ account: "ANONYMOUS", result: passed ? "PASS" : "FAIL", albumCount: count });
    if (!passed) throw new Error("Anonymous sessions can still read member album records");
  };

  const checkUser = async (label, email, password, expectVisible) => {
    const client = createScopedClient();
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data?.session) throw new Error(label + " test account authentication failed");
      // The test verifies the RLS response of the authenticated JWT, not a
      // SQL-Editor simulated role, so it catches direct PostgREST exposure.
      const count = await getAlbumCount(client);
      const passed = expectVisible ? count > 0 : count === 0;
      results.push({ account: label, result: passed ? "PASS" : "FAIL", albumCount: count });
      if (!passed) {
        throw new Error(
          label + " album read policy mismatch: " +
          (expectVisible ? "expected at least one visible album" : "expected zero member albums")
        );
      }
    } finally {
      await client.auth.signOut().catch(() => {});
    }
  };

  try {
    await checkAnon();
    await checkUser(
      "FREE",
      process.env.JB_TEST_FREE_EMAIL,
      process.env.JB_TEST_FREE_PASSWORD,
      false
    );
    await checkUser(
      "STANDARD/VIP",
      process.env.JB_TEST_MEMBER_EMAIL,
      process.env.JB_TEST_MEMBER_PASSWORD,
      true
    );
    for (const result of results) {
      console.log(result.account + ": " + result.result + " (album rows: " + result.albumCount + ")");
    }
    console.log("3/3 account-level album RLS checks passed. No data was changed.");
  } catch (error) {
    for (const result of results) {
      console.log(result.account + ": " + result.result + " (album rows: " + result.albumCount + ")");
    }
    console.error("Album RLS verification FAILED: " + error.message);
    console.error("Confirm the paid test account has an active entitlement and at least one visible album.");
    process.exitCode = 1;
  } finally {
    // Reduce time credentials live in Node memory (environment variables
    // should also be cleared by the invoking PowerShell session).
    for (const variable of required) delete process.env[variable];
  }
}
