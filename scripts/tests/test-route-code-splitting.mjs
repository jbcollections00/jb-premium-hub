// Phase 320: source-level safety checks for route code-splitting.
// No account credentials, browser requests, or video/media operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const expectedRoutes = [
  '/', '/login', '/signup', '/reset-password', '/admin-login',
  '/terms', '/privacy', '/dmca', '/support',
  '/home', '/for-you', '/activate', '/profile',
  '/messages', '/buy-vip', '/subscribe',
  '/contest', '/leaderboard', '/admin-vault-secret', '*'
];
const lazyPages = [
  'Login', 'Signup', 'ResetPassword', 'Home', 'ActivateCode',
  'Profile', 'Messages', 'BuyVip', 'Subscribe', 'Contest',
  'LeaderboardPage', 'AdminDashboard', 'AdminLogin',
  'TermsPage', 'PrivacyPage', 'DmcaPage', 'SupportPage'
];
test('all previous routes remain registered exactly once', () => {
  const paths = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual([...paths].sort(), [...expectedRoutes].sort());
  assert.equal(paths.length, new Set(paths).size);
});
test('all page routes load lazily without eager page imports', () => {
  for (const page of lazyPages) {
    assert.match(app, new RegExp('const\\s+' + page + '\\s*=\\s*lazy\\(\\(\\)\\s*=>\\s*import\\('));
  }
  assert.equal((app.match(/=\s*lazy\(/g) || []).length, lazyPages.length);
  assert.ok(!/import\s+.*?\s+from\s+['"]\.\/pages\//.test(app));
});
test('routing guards and existing redirects remain unchanged', () => {
  assert.match(app, /<Route element=\{<ProtectedRoute \/>}/);
  assert.match(app, /<Route element=\{<ProtectedRoute adminOnly=\{true\} \/>}/);
  assert.match(app, /<Route path="\/for-you" element=\{<Navigate to="\/home" replace \/>}/);
  assert.match(app, /<Route path="\*" element=\{<Navigate to="\/home" replace \/>}/);
  assert.match(app, /<Route path="\/" element=\{<Navigate to="\/home" replace \/>}/);
});
test('has an accessible Suspense fallback and retains event popup', () => {
  assert.match(app, /<Suspense fallback=\{<RouteLoading \/>}>/);
  assert.match(app, /role="status"/);
  assert.match(app, /<EventPopup \/>/);
});
