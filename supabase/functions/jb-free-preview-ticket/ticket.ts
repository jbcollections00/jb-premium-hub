// Pure HMAC/URL contract shared by the Edge issuer and offline Worker tests.
// Must match Cloudflare jb-premium-private-media-v1 verifyTicket().
const MEDIA_ORIGIN = 'https://cdn.jb-premium-hub.vip';
const encoder = new TextEncoder();

function base64url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Matches deployed Worker verifyTicket(): HMAC-SHA256 over the ASCII
// base64url-encoded JSON body, NOT the raw JSON itself.
export async function signTicket(
  secret: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return body + '.' + base64url(signature);
}

export function privateKeyFromMediaUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  // Reject traversal before URL parsing, which otherwise normalizes .. away.
  if (!raw.startsWith(MEDIA_ORIGIN + '/')) return null;
  const unparsedPath = raw.slice(MEDIA_ORIGIN.length + 1);
  if (/(^|\/)\.{1,2}(\/|$)/.test(unparsedPath) ||
      /%2e|%2f|%5c/i.test(unparsedPath)) return null;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.origin !== MEDIA_ORIGIN || parsed.protocol !== 'https:' ||
      parsed.username || parsed.password || parsed.search || parsed.hash) return null;

  let path: string;
  try { path = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')); } catch { return null; }
  const isRoot = /^[A-Za-z0-9_-]+\.mp4$/i.test(path);
  const isFolder = /^videos\/[A-Za-z0-9._/-]+\.mp4$/i.test(path) &&
    !path.split('/').some((piece) => !piece || piece === '.' || piece === '..');
  return isRoot || isFolder ? path : null;
}

/**
 * Resolve Free Preview playback only to an already-validated Worker bucket key.
 * Legacy CDN URLs still resolve to VIDEO_BUCKET; private staging references
 * target STAGING_VIDEO_BUCKET via a separate signed "storage" claim.
 * Bind the staged filename to the exact database media ID to avoid cross-media
 * object-key substitution. No R2 bucket name or path comes from request input.
 */
export function resolveFreePreviewMediaKey(raw: unknown, mediaId: string):
  { key: string; storage?: 'staging-private' } | null {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof mediaId !== 'string' || !uuid.test(mediaId)) return null;
  if (typeof raw !== 'string' || raw.length > 2048) return null;

  if (raw.startsWith('r2:')) {
    // Don't allow escaped path components, traversal, fragments, or parameters.
    if (!raw.startsWith('r2://') || raw.includes('%') || raw.includes('\\') || raw.includes('?') || raw.includes('#')) return null;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'r2:' ||
          parsed.hostname !== 'jb-premium-private-videos' ||
          parsed.username || parsed.password || parsed.port ||
          parsed.search || parsed.hash) return null;
      const key = parsed.pathname.slice(1);
      const match = /^staging\/([^/]+)\/([^/]+)\.mp4$/i.exec(key);
      if (!match || !uuid.test(match[1]) || !uuid.test(match[2])) return null;
      if (match[2].toLowerCase() !== mediaId.toLowerCase()) return null;
      return { key, storage: 'staging-private' };
    } catch {
      return null;
    }
  }

  const legacyKey = privateKeyFromMediaUrl(raw);
  return legacyKey ? { key: legacyKey } : null;
}
