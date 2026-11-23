// Shared safe-path validation for the dedicated branding processor.
export const PRIVATE_BUCKET = "jb-premium-private-videos";
export const SETTINGS_KEY = "branding/settings/current.json";
export const sourceKey = (mediaId, value) => {
  const s = String(value || "");
  const re = /^staging\/[0-9a-f-]{36}\/([0-9a-f-]{36})\.mp4$/;
  const match = re.exec(s);
  if (!match || match[1] !== String(mediaId || "").toLowerCase()) {
    throw new Error("Source media identity mismatch");
  }
  return s;
};
export const destinationKey = (mediaId, version) => {
  if (!/^[0-9a-f-]{36}$/.test(String(mediaId || "")) ||
      !Number.isSafeInteger(version) || version < 1 || version > 2147483647) {
    throw new Error("Invalid processed destination");
  }
  return `branding/processed/${mediaId}/v${version}.mp4`;
};
export function verifyAssetConfig(config) {
  const version = Number(config?.version);
  if (!Number.isSafeInteger(version) || version < 1 || version > 2147483647) {
    throw new Error("No activated branding configuration");
  }
  for (const [kind, ext] of Object.entries({ intro: "mp4", watermark: "png", logo: "png" })) {
    const key = config?.[kind];
    const re = new RegExp(`^branding/assets/${kind}/[0-9a-f-]{36}\\.${ext}$`);
    if (typeof key !== "string" || !re.test(key)) {
      throw new Error("Missing or invalid " + kind + " branding asset");
    }
  }
  return { version, intro: config.intro, watermark: config.watermark, logo: config.logo };
}
