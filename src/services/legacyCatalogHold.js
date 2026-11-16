/**
 * Phase 333G: Legacy catalog presentation hold.
 *
 * Keep this ENABLED while pre-existing media rows remain under review.
 * This is a browser-level suppression only: it does not modify or delete
 * Supabase rows, remove Cloudflare objects, or revoke server-issued tickets.
 * Production requires a separately verified server-side hold.
 *
 * Do not disable until all applicable content-safety and media access
 * clearance requirements have been completed.
 */
export const LEGACY_CATALOG_HOME_HOLD = true;
