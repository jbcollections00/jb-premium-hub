import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatBillingCount, formatBillingDate, formatBillingPeso,
} from '../../src/services/adminBillingDisplay.js';

test('missing money is not mislabeled as PHP zero', () => {
  for (const value of [null, undefined, '', ' ', 'bad', 'NaN', 'Infinity', NaN, -1]) {
    assert.equal(formatBillingPeso(value), '—', String(value));
  }
  assert.equal(formatBillingPeso(0), '₱0.00');
  assert.equal(formatBillingPeso('5000'), '₱50.00');
  assert.equal(formatBillingPeso(15000), '₱150.00');
});
test('missing or fractional counts are not represented as zero', () => {
  for (const value of [null, undefined, '', ' ', 'abc', -1, 1.5, '1.5']) {
    assert.equal(formatBillingCount(value), '—', String(value));
  }
  assert.equal(formatBillingCount(0), '0');
  assert.equal(formatBillingCount('2000'), '2,000');
});
test('unavailable and invalid dates remain explicitly unknown', () => {
  for (const value of [null, undefined, '', 'nonsense', 0]) {
    assert.equal(formatBillingDate(value), '—', String(value));
  }
  assert.notEqual(formatBillingDate('2026-11-16T04:00:00Z'), '—');
});
const source = readFileSync(new URL('../../src/pages/admin/AdminBillingTab.jsx', import.meta.url), 'utf8');
test('billing admin continues to use read-only server RPC', () => {
  assert.match(source, /supabase\.rpc\('jb_billing_admin_overview_v1'\)/);
  assert.match(source, /data\.read_only !== true \|\| data\.environment !== 'live'/);
  assert.ok(!/supabase\.from\(/.test(source));
});
test('late refresh and unmounted RPC responses are ignored', () => {
  assert.match(source, /const requestSerial = \+\+requestSerialRef\.current;/);
  assert.match(source, /if \(requestSerial !== requestSerialRef\.current\) return;/);
  assert.match(source, /requestSerialRef\.current \+= 1;/);
});
test('failure on refresh retains snapshot but marks it stale', () => {
  assert.match(source, /if \(!refresh\) setReport\(null\)/);
  assert.match(source, /Refresh failed\. Showing the last successfully loaded report/);
  assert.match(source, /Values may be outdated/);
});
