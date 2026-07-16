const REQUIRED = [
  'GATEWAY_BASE_URL',
  'GATEWAY_API_KEY',
  'STREAM_SIGNING_SECRET',
  'QUEUE_TABLE'
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

  const gatewayBaseUrl = env.GATEWAY_BASE_URL.trim().replace(/\/$/, '');
  const parsedGatewayUrl = new URL(gatewayBaseUrl);
  if (parsedGatewayUrl.protocol !== 'https:') {
    throw new Error('GATEWAY_BASE_URL must use https');
  }

  return {
    gatewayBaseUrl,
    gatewayApiKey: env.GATEWAY_API_KEY.trim(),
    streamSigningSecret: env.STREAM_SIGNING_SECRET.trim(),
    streamUrlTtlSeconds: parsePositiveInteger(
      env.STREAM_URL_TTL_SECONDS,
      900,
      'STREAM_URL_TTL_SECONDS'
    ),
    queueTable: env.QUEUE_TABLE.trim(),
    alexaSkillId: env.ALEXA_SKILL_ID?.trim() || null,
    maxQueueTracks: Math.min(
      parsePositiveInteger(env.MAX_QUEUE_TRACKS, 150, 'MAX_QUEUE_TRACKS'),
      500
    )
  };
}
