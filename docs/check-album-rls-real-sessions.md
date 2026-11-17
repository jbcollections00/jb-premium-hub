# Focused album RLS check using real signed-in sessions

The previous Phase 333I SQL migration has already been applied to Supabase and the policy listing was confirmed. Do **not** rerun the migration or the existing Vite build.

This one-off script uses the same **public/publishable Supabase client** as the frontend; it performs **read-only** album counts using three independent sessions:

- ANONYMOUS: expects 0 member album rows.
- FREE test user: expects 0 member album rows.
- STANDARD or VIP test user (with an active membership): expects at least 1 visible album (the existing Educational Videos test collection).

Nothing is inserted, deleted, published, or uploaded. No video or thumbnail data is queried.

## Run in Windows PowerShell

First check that the branch is clean, fetch its latest commit, then switch only if no changes are present:

```powershell
Set-Location "$env:USERPROFILE\JB_ReleaseCandidates\Phase333-Albums"
git status --short
git fetch origin phase-333i-tier-home-views
git switch --detach origin/phase-333i-tier-home-views
```

Enter temporary **test account** login details locally, not in GitHub, screenshots, or this chat:

```powershell
$env:JB_TEST_FREE_EMAIL = Read-Host "FREE test account email"
$freeSecret = Read-Host "FREE test account password" -AsSecureString
$env:JB_TEST_FREE_PASSWORD = [System.Net.NetworkCredential]::new("", $freeSecret).Password

$env:JB_TEST_MEMBER_EMAIL = Read-Host "Active STANDARD/VIP test account email"
$memberSecret = Read-Host "STANDARD/VIP test account password" -AsSecureString
$env:JB_TEST_MEMBER_PASSWORD = [System.Net.NetworkCredential]::new("", $memberSecret).Password

try {
  node .\scripts\tests\verify-album-rls-sessions.mjs
} finally {
  Remove-Item Env:\JB_TEST_FREE_EMAIL, Env:\JB_TEST_FREE_PASSWORD, Env:\JB_TEST_MEMBER_EMAIL, Env:\JB_TEST_MEMBER_PASSWORD -ErrorAction SilentlyContinue
  Remove-Variable freeSecret, memberSecret -ErrorAction SilentlyContinue
}
```

Expected: `ANONYMOUS: PASS`, `FREE: PASS`, `STANDARD/VIP: PASS`, and `3/3 account-level album RLS checks passed`.

If the STANDARD/VIP check reports no albums, confirm the test account really has an active paid entitlement and at least one album is visible. **Do not change RLS or disable the media hold to make the test pass.**

## Important

The new upload-to-album workflow is **not** enabled by this test. The previous legacy media catalog home hold remains enabled. To publish content, the system separately needs trusted backend intake and independently cleared, lawful video content. No upload or release is performed by this QA script.
