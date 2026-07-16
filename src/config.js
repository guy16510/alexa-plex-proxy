const REQUIRED = [
  'ALEXA_SKILL_ID',
  'PLEX_URL',
  'PLEX_TOKEN',
  'STREAM_BASE_URL',
  'QUEUE_TABLE'
];

function parsePositiveInteger(value, fallback, name, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return parsed;
}

function normalizeBaseUrl(value, name) {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS`);
  }
  return url.toString().replace(/\/$/, '');
}

export function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const transcodePolicy = env.TRANSCODE_POLICY?.trim().toLowerCase() || 'auto';
  if (!['auto', 'always', 'never'].includes(transcodePolicy)) {
    throw new Error('TRANSCODE_POLICY must be auto, always, or never');
  }

  return {
    alexaSkillId: env.ALEXA_SKILL_ID.trim(),
    plexUrl: normalizeBaseUrl(env.PLEX_URL.trim(), 'PLEX_URL'),
    plexToken: env.PLEX_TOKEN.trim(),
    plexMusicLibrary: env.PLEX_MUSIC_LIBRARY?.trim() || 'Music',
    streamBaseUrl: normalizeBaseUrl(env.STREAM_BASE_URL.trim(), 'STREAM_BASE_URL'),
    queueTable: env.QUEUE_TABLE.trim(),
    maxQueueTracks: parsePositiveInteger(env.MAX_QUEUE_TRACKS, 150, 'MAX_QUEUE_TRACKS', 500),
    maxAudioBitrate: parsePositiveInteger(env.MAX_AUDIO_BITRATE, 192, 'MAX_AUDIO_BITRATE', 384),
    transcodePolicy,
    queueTtlHours: parsePositiveInteger(env.QUEUE_TTL_HOURS, 24, 'QUEUE_TTL_HOURS', 168),
    plexRequestTimeoutMs: parsePositiveInteger(
      env.PLEX_REQUEST_TIMEOUT_MS,
      10_000,
      'PLEX_REQUEST_TIMEOUT_MS',
      60_000
    )
  };
}
