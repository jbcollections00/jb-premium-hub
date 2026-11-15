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
