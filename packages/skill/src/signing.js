import { createHmac } from 'node:crypto';

export function normalizeMediaPath(input) {
  if (typeof input !== 'string' || input.length === 0 || input.length > 2048) {
    throw new Error('Invalid media path');
  }

  const decoded = decodeURIComponent(input);
  if (decoded.split('/').some((segment) => segment === '..' || segment === '.')) {
    throw new Error('Invalid media path');
  }

  const parsed = new URL(decoded, 'http://local.invalid');
  const pathname = parsed.pathname;

  if (!pathname.startsWith('/library/parts/')) {
    throw new Error('Only Plex library part paths are allowed');
  }
  if (pathname.includes('\\') || pathname.split('/').some((segment) => segment === '..' || segment === '.')) {
    throw new Error('Invalid media path');
  }
  if (!/\/file(?:\.[a-z0-9]+)?$/i.test(pathname)) {
    throw new Error('Media path must point to a Plex file endpoint');
  }

  return pathname;
}

export function signMediaPath(mediaPath, expiresAt, secret) {
  const normalizedPath = normalizeMediaPath(mediaPath);
  return createHmac('sha256', secret)
    .update(`v1\n${normalizedPath}\n${expiresAt}`)
    .digest('base64url');
}

export function buildSignedStreamUrl({ baseUrl, mediaPath, secret, ttlSeconds, now }) {
  const normalizedPath = normalizeMediaPath(mediaPath);
  const currentTime = Number.isInteger(now) ? now : Math.floor(Date.now() / 1000);
  const expiresAt = currentTime + ttlSeconds;
  const signature = signMediaPath(normalizedPath, expiresAt, secret);
  const url = new URL('/v1/stream', `${baseUrl}/`);
  url.searchParams.set('path', normalizedPath);
  url.searchParams.set('exp', String(expiresAt));
  url.searchParams.set('sig', signature);
  return url.toString();
}
