import { signTicket, privateKeyFromMediaUrl } from
  '../../supabase/functions/jb-free-preview-ticket/ticket.ts';
import worker from './fixtures/private-worker-reference.mjs';

const MEDIA_ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER_ID = '223e4567-e89b-42d3-a456-426614174000';
const USER_ID = '323e4567-e89b-42d3-a456-426614174000';
const SECRET = 'X'.repeat(64);
const WORKER = 'https://jb-premium-private-media-v1.jbnetproxy.workers.dev';
const ORIGIN = 'https://www.jb-premium-hub.vip';
const DATA = new TextEncoder().encode('0123456789');

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const env = {
  PRIVATE_MEDIA_ENABLED: 'true',
  JB_PRIVATE_MEDIA_HMAC_SECRET: SECRET,
  VIDEO_BUCKET: {
    head: async (key: string) =>
      key === 'videos/test.mp4'
        ? { size: DATA.length, httpEtag: '"test-etag"' }
        : null,
    get: async (key: string, opts?: { range: { offset: number; length: number } }) => {
      if (key !== 'videos/test.mp4') return null;
      const range = opts?.range;
      const data = range
        ? DATA.slice(range.offset, range.offset + range.length)
        : DATA;
      return { body: new Response(data).body };
    },
  },
};

async function ticket(extra: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return await signTicket(SECRET, {
    v: 1, aud: 'jb-premium-private-media',
    mid: MEDIA_ID, act: 'play',
    sub: USER_ID, iat: now, exp: now + 900,
    key: 'videos/test.mp4', ...extra,
  });
}

Deno.test('free preview signer creates a WORKER-compatible PLAY ticket and partial stream', async () => {
  const signed = await ticket();
  const response = await worker.fetch(new Request(
    WORKER + '/v/' + MEDIA_ID + '/play?ticket=' + encodeURIComponent(signed),
    { headers: { Origin: ORIGIN, Range: 'bytes=0-3' } },
  ), env);
  assert(response.status === 206, 'Expected 206 from existing Worker using new issuer');
  assert(response.headers.get('content-range') === 'bytes 0-3/10', 'Incorrect video range');
  assert(await response.text() === '0123', 'Incorrect stream bytes');
  assert(response.headers.get('content-disposition') === 'inline', 'Free play must not be download');
});

Deno.test('PLAY ticket cannot be converted into a DOWNLOAD ticket', async () => {
  const signed = await ticket();
  const response = await worker.fetch(new Request(
    WORKER + '/v/' + MEDIA_ID + '/download?ticket=' + encodeURIComponent(signed),
    { headers: { Origin: ORIGIN } },
  ), env);
  assert(response.status === 403, 'PLAY ticket must NOT authorize download');
});

Deno.test('wrong media ID and expired tickets are denied', async () => {
  const signed = await ticket();
  const other = await worker.fetch(new Request(
    WORKER + '/v/' + OTHER_ID + '/play?ticket=' + encodeURIComponent(signed),
    { headers: { Origin: ORIGIN } },
  ), env);
  assert(other.status === 403, 'Ticket not bound to exact video');

  const now = Math.floor(Date.now() / 1000);
  const expired = await ticket({ iat: now - 901, exp: now - 1 });
  const expiredResponse = await worker.fetch(new Request(
    WORKER + '/v/' + MEDIA_ID + '/play?ticket=' + encodeURIComponent(expired),
    { headers: { Origin: ORIGIN } },
  ), env);
  assert(expiredResponse.status === 403, 'Expired ticket accepted');
});

Deno.test('without ticket or with disabled Worker, video remains locked', async () => {
  const without = await worker.fetch(new Request(
    WORKER + '/v/' + MEDIA_ID + '/play',
    { headers: { Origin: ORIGIN } },
  ), env);
  assert(without.status === 403, 'Unauthenticated Worker should not stream');

  const locked = await worker.fetch(new Request(
    WORKER + '/v/' + MEDIA_ID + '/play',
    { headers: { Origin: ORIGIN } },
  ), { ...env, PRIVATE_MEDIA_ENABLED: 'false' });
  assert(locked.status === 503, 'Worker must remain OFF until explicitly enabled');
});

Deno.test('private object key parser accepts only restricted CDN MP4 paths', () => {
  assert(privateKeyFromMediaUrl('https://cdn.jb-premium-hub.vip/videos/test.mp4') ===
    'videos/test.mp4', 'Valid video key rejected');
  assert(privateKeyFromMediaUrl('https://cdn.jb-premium-hub.vip/test.mp4') ===
    'test.mp4', 'Valid root video key rejected');
  for (const candidate of [
    'https://attacker.example/videos/test.mp4',
    'http://cdn.jb-premium-hub.vip/videos/test.mp4',
    'https://cdn.jb-premium-hub.vip/videos/../test.mp4',
    'https://cdn.jb-premium-hub.vip/videos/test.mp4?download=1',
    'https://cdn.jb-premium-hub.vip/videos/test.jpg',
    'https://cdn.jb-premium-hub.vip/video.mp4#fragment',
  ]) {
    assert(privateKeyFromMediaUrl(candidate) === null,
      'Unsafe media source key accepted: ' + candidate);
  }
});
