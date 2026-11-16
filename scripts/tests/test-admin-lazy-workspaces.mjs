import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/pages/admin/AdminDashboard.jsx', import.meta.url), 'utf8');
const tabs = {
  SupportTicketsTab: './SupportTicketsTab',
  AccessCodesTab: './AccessCodesTab',
  AdminUsersTab: './AdminUsersTab',
  AdminMessagesTab: './AdminMessagesTab',
  AdminMediaTab: './AdminMediaTab',
  AdminBillingTab: './AdminBillingTab',
  ChatReports: './ChatReports',
  ChatAnalytics: './ChatAnalytics',
  AdminEventControl: '../../components/admin/AdminEventControl'
};

test('all nine optional admin components are lazy, with no eager duplicate import', () => {
  for (const [name, modulePath] of Object.entries(tabs)) {
    assert.ok(source.includes("const " + name + " = lazy(() => import('" + modulePath + "'));"), name);
    assert.ok(!source.includes("import " + name + " from "), name + ' still eager-loaded');
  }
});
test('tab Suspense has accessible loading status', () => {
  assert.match(source, /<Suspense fallback=\{<AdminTabLoading \/>\}>/);
  assert.match(source, /role="status" aria-live="polite"/);
});
test('existing tab IDs and props are preserved', () => {
  for (const id of ['events','billing','tickets','users','messages','chat-reports','chat-analytics','codes','upload']) {
    assert.ok(source.includes("activeTab === '" + id + "'"), 'missing ' + id);
  }
  assert.match(source, /<AdminUsersTab users=\{users\} fetchData=\{fetchData\} onlineUserIds=\{onlineUserIds\} \/>/);
  assert.match(source, /<SupportTicketsTab supabase=\{supabase\} \/>/);
});
test('overview, admin authentication context and signout remain present', () => {
  assert.match(source, /activeTab === 'dashboard'/);
  assert.match(source, /handleAdminLogout/);
  assert.match(source, /ProtectedRoute adminOnly/);
  assert.match(source, /getUser\(\)/);
});
