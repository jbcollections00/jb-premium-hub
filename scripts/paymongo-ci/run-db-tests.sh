#!/usr/bin/env bash
set -Eeuo pipefail

# This script must ONLY run against disposable PostgreSQL in GitHub Actions.
if [[ "${CI:-}" != "true" || "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "STOP: GitHub Actions CI context required" >&2
  exit 1
fi
if [[ "${PGDATABASE:-}" != "jb_payment_ci" || "${PGHOST:-}" != "127.0.0.1" ]]; then
  echo "STOP: expected local disposable jb_payment_ci, not a remote Supabase instance" >&2
  exit 1
fi
if [[ "${PGOPTIONS:-}" != *"jb.isolated_ci=true"* ]]; then
  echo "STOP: missing isolated CI guard" >&2
  exit 1
fi
if [[ -n "${DATABASE_URL:-}" || -n "${SUPABASE_DB_URL:-}" || -n "${PAYMONGO_LIVE_SECRET_KEY:-}" ]]; then
  echo "STOP: production credentials must not be supplied to CI" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL=(psql -X -v ON_ERROR_STOP=1)
echo "[CI] Applying metadata-derived schema to disposable local Postgres..."
"${PSQL[@]}" -f "$ROOT/sql/paymongo-ci/01_schema.sql"
echo "[CI] Installing exact exported billing functions..."
"${PSQL[@]}" -f "$ROOT/sql/paymongo-ci/02_functions.sql"
echo "[CI] Executing LIVE billing SQL integration tests using synthetic evidence..."
"${PSQL[@]}" -f "$ROOT/sql/paymongo-ci/03_integration.sql"

AUDIT_ID="$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT val FROM ci.fixtures WHERE name='concurrent_audit'")"
[[ "$AUDIT_ID" =~ ^[0-9a-f-]{36}$ ]] || { echo 'Invalid synthetic audit fixture' >&2; exit 1; }
CONCURRENT_CMD="SET ROLE service_role; SELECT public.jb_billing_settle_verified_live_v1('$AUDIT_ID'::uuid);"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT

echo "[CI] Invoking two simultaneous settlement connections..."
"${PSQL[@]}" -At -c "$CONCURRENT_CMD" > "$TEMP/a.log" 2>&1 &
P1=$!
"${PSQL[@]}" -At -c "$CONCURRENT_CMD" > "$TEMP/b.log" 2>&1 &
P2=$!
status1=0; status2=0
wait "$P1" || status1=$?
wait "$P2" || status2=$?
if [[ "$status1" -ne 0 || "$status2" -ne 0 ]]; then
  echo 'Concurrent settlement error; output follows:' >&2
  cat "$TEMP/a.log" "$TEMP/b.log" >&2
  exit 1
fi
if ! grep -q '"status": "settled"' "$TEMP/a.log" "$TEMP/b.log"; then
  echo "Missing initial settled result" >&2; cat "$TEMP/"*.log >&2; exit 1
fi
if ! grep -q '"status": "already_settled"' "$TEMP/a.log" "$TEMP/b.log"; then
  echo "Missing idempotent already_settled result" >&2; cat "$TEMP/"*.log >&2; exit 1
fi
"${PSQL[@]}" -f "$ROOT/sql/paymongo-ci/04_verify_concurrency.sql"
echo '[CI PASS] PostgreSQL function integration, RLS model, queue and concurrency checks.'
