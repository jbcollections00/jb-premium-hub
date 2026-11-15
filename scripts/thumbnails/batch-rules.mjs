/** Phase 317D: pure local thumbnail layout and timing rules. */
export const INTRO_SKIP_SECONDS = 23;
export const END_MARGIN_SECONDS = 1.5;

export function captureTimes(durationSeconds, portrait) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const latest = duration - END_MARGIN_SECONDS;
  if (latest < INTRO_SKIP_SECONDS) return null;

  if (!portrait) return [INTRO_SKIP_SECONDS];

  // Three distinct frames must all come from AFTER the 22s introduction.
  if (latest - INTRO_SKIP_SECONDS < 2) return null;

  const round = (value) => Number(value.toFixed(3));
  return [
    INTRO_SKIP_SECONDS,
    round((INTRO_SKIP_SECONDS + latest) / 2),
    round(latest),
  ];
}

export function portraitOrientation(stream) {
  const width = Number(stream?.width);
  const height = Number(stream?.height);
  if (!(width > 0 && height > 0)) throw new Error("Missing video dimensions.");

  // FFmpeg auto-rotates on extraction. Match this display orientation.
  const rotation = Number(
    stream?.side_data_list?.find((data) => Number.isFinite(Number(data.rotation)))?.rotation ??
    stream?.tags?.rotate ??
    0
  );
  const quarterTurn = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  return quarterTurn ? width > height : height > width;
}
