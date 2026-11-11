import { supabase } from './supabaseClient';

// One read-only source for LIVE paid entitlements.
// This controls UI presentation only; private media and downloads still require
// backend authorization and must not rely on a browser boolean.
export function normalizeBillingAccess(raw) {
  const rows = Array.isArray(raw) ? raw : [raw];
  if (rows.length !== 1) throw new Error('Unexpected billing access response');
  const row = rows[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Invalid billing access response');
  }
  const tier = row.tier;
  if (!['free', 'standard', 'vip'].includes(tier) ||
      typeof row.can_view_albums !== 'boolean' ||
      typeof row.can_download !== 'boolean' ||
      typeof row.show_ads !== 'boolean') {
    throw new Error('Invalid billing access fields');
  }

  const expiry = row.access_expires_at == null ? null : new Date(row.access_expires_at);
  if (expiry && Number.isNaN(expiry.getTime())) throw new Error('Invalid membership expiry');
  const active = expiry !== null && expiry.getTime() > Date.now();
  if (tier === 'free') {
    if (row.can_view_albums || row.can_download) throw new Error('Invalid free entitlement');
    return { tier: 'free', canViewAlbums: false, canDownload: false, showAds: false, expiresAt: null };
  }
  if (!active || !row.can_view_albums ||
      row.can_download !== (tier === 'vip') ||
      row.show_ads !== (tier === 'standard')) {
    throw new Error('Inconsistent or expired billing entitlement');
  }
  return {
    tier,
    canViewAlbums: true,
    canDownload: tier === 'vip',
    showAds: tier === 'standard',
    expiresAt: expiry.toISOString(),
  };
}

export async function getBillingAccess() {
  const { data, error } = await supabase.rpc('jb_billing_my_access');
  if (error) throw error;
  return normalizeBillingAccess(data);
}

export function getLegacyPrivileges(profile) {
  const accountType = String(profile?.account_type || '').toLowerCase();
  const role = String(profile?.role || '').toLowerCase();
  const isAdmin = accountType === 'admin' || role === 'admin';
  const vipExpires = profile?.vip_until ? new Date(profile.vip_until) : null;
  const isLegacyVip = accountType === 'vip' &&
    vipExpires !== null && !Number.isNaN(vipExpires.getTime()) &&
    vipExpires.getTime() > Date.now();
  return { isAdmin, isLegacyVip };
}

export function resolveMemberPresentation(profile, billing) {
  const { isAdmin, isLegacyVip } = getLegacyPrivileges(profile);
  if (isAdmin) return { tier: 'admin', canViewAlbums: true, canDownload: true, showAds: false, isAdmin: true };
  if (billing?.tier === 'vip') return { ...billing, isAdmin: false };
  // Preserve previously issued VIP codes independently of PayMongo.
  if (isLegacyVip) return { tier: 'vip', canViewAlbums: true, canDownload: true, showAds: false, isAdmin: false };
  if (billing?.tier === 'standard') return { ...billing, isAdmin: false };
  return { tier: 'free', canViewAlbums: false, canDownload: false, showAds: false, isAdmin: false };
}
