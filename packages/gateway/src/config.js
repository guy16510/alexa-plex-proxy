const REQUIRED = [
  'PLEX_URL',
  'PLEX_TOKEN',
  'GATEWAY_API_KEY',
  'STREAM_SIGNING_SECRET'
];

function parsePositiveInteger(value, fallback, name) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const plexUrl = env.PLEX_URL.trim().replace(/\/$/, '');
  const parsedPlexUrl = new URL(plexUrl);
  if (!['http:', 'https:'].includes(parsedPlexUrl.protocol)) {
    throw new Error('PLEX_URL must use http or https');
  }

  return {
    port: parsePositiveInteger(env.PORT, 3000, 'PORT'),
    plexUrl,
    plexToken: env.PLEX_TOKEN.trim(),
    plexMusicLibrary: env.PLEX_MUSIC_LIBRARY?.trim() || 'Music',
    gatewayApiKey: env.GATEWAY_API_KEY.trim(),
    streamSigningSecret: env.STREAM_SIGNING_SECRET.trim(),
    streamUrlMaxTtlSeconds: parsePositiveInteger(
      env.STREAM_URL_MAX_TTL_SECONDS,
      21_600,
      'STREAM_URL_MAX_TTL_SECONDS'
    ),
    maxQueueTracks: Math.min(
      parsePositiveInteger(env.MAX_QUEUE_TRACKS, 150, 'MAX_QUEUE_TRACKS'),
      500
    )
  };
}
