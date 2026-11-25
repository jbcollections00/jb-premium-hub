import { resolveFreePreviewMediaKey, privateKeyFromMediaUrl, signTicket } from
  '../../supabase/functions/jb-free-preview-ticket/ticket.ts';

const mediaId = 'b93f441c-f88d-4bc6-93a9-b808f9296764';
const otherId = '87927ed2-f877-4df2-b4b8-8caa96d48a9e';
const adminId = 'dfcdc689-f6a9-4fb1-af3c-c04080865239';
const key = `staging/${adminId}/${mediaId}.mp4`;
const source = `r2://jb-premium-private-videos/${key}`;

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}

Deno.test('FREE issuer accepts staged MP4 with matching video identity', () => {
  const parsed = resolveFreePreviewMediaKey(source, mediaId);
  assert(parsed !== null, 'Expected a valid staging key');
  assert(parsed.key === key, 'Wrong staging key');
  assert(parsed.storage === 'staging-private', 'Missing Worker staging bucket hint');
});

Deno.test('legacy CDN URLs retain the existing bucket and key contract', () => {
  const url = 'https://cdn.jb-premium-hub.vip/videos/example.mp4';
  const parsed = resolveFreePreviewMediaKey(url, mediaId);
  assert(parsed?.key === 'videos/example.mp4', 'Legacy URL rejected');
  assert(parsed.storage === undefined, 'Legacy media must use VIDEO_BUCKET');
  assert(privateKeyFromMediaUrl(url) === parsed.key, 'Old parser behavior changed');
});

Deno.test('FREE issuer rejects mismatched media UUID', () => {
  assert(resolveFreePreviewMediaKey(source, otherId) === null, 'Cross-video key was accepted');
  assert(resolveFreePreviewMediaKey(source, 'not-a-uuid') === null, 'Invalid video UUID accepted');
});

Deno.test('FREE issuer rejects invalid private R2 references', () => {
  const invalid = [
    `r2://attacker-bucket/${key}`,
    `r2://jb-premium-private-videos/different/${adminId}/${mediaId}.mp4`,
    `r2://jb-premium-private-videos/staging/not-a-uuid/${mediaId}.mp4`,
    `r2://jb-premium-private-videos/staging/${adminId}/${otherId}.mp4`,
    `r2://jb-premium-private-videos/${key}?x=1`,
    `r2://jb-premium-private-videos/${key}#fragment`,
    `r2://jb-premium-private-videos/staging/../${mediaId}.mp4`,
    `r2://jb-premium-private-videos/${key.replaceAll('/', '%2f')}`,
    `r2://jb-premium-private-videos/${key.replaceAll('/', '\\')}`,
    `r2://jb-premium-private-videos/${key.replace('.mp4', '.jpg')}`,
    'javascript:alert(1)',
    'https://attacker.example/videos/test.mp4',
  ];
  for (const value of invalid) {
    assert(resolveFreePreviewMediaKey(value, mediaId) === null, 'Invalid reference accepted');
  }
});

Deno.test('FREE issuer signs a PLAY-only private staging ticket payload', async () => {
  const selection = resolveFreePreviewMediaKey(source, mediaId);
  assert(selection !== null, 'Expected allowed selection');
  const payload = {
    v: 1, aud: 'jb-premium-private-media',
    mid: mediaId, act: 'play',
    sub: otherId, iat: 1000000000, exp: 1000000900,
    key: selection.key, storage: selection.storage,
  };
  const signed = await signTicket('T'.repeat(64), payload);
  assert(signed.split('.').length === 2, 'Signature format changed');
  const encoded = signed.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
  const signedBody = JSON.parse(atob(encoded));
  assert(signedBody.act === 'play', 'Free preview must be play-only');
  assert(signedBody.key === selection.key, 'Wrong signed key');
  assert(signedBody.storage === 'staging-private', 'Wrong signed storage');
});

Deno.test('FREE issuer remains limited to authenticated selected-video playback', async () => {
  const source = await Deno.readTextFile('supabase/functions/jb-free-preview-ticket/index.ts');
  assert(source.includes("data.action !== 'play'"), 'Download requests must be disallowed');
  assert(source.includes("video.is_free_preview !== true"), 'Admin selection required');
  assert(source.includes("admin.auth.getUser(bearer[1])"), 'User token validation required');
  assert(source.includes('JB_FREE_PREVIEW_TICKETS_ENABLED'), 'Issuance gate missing');
  assert(source.includes('JB_FREE_PREVIEW_PRIVATE_CDN_CONFIRMED'), 'Private CDN gate missing');
  assert(source.includes('resolveFreePreviewMediaKey(video.media_url, mediaId)'), 'Staging resolver not used');
});
