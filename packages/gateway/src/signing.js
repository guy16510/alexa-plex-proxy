import { createHmac, timingSafeEqual } from 'node:crypto';

const PART_PATH_PREFIX = '/library/parts/';

export function normalizeMediaPath(input) {
  if (typeof input !== 'string' || input.length === 0 || input.length > 2048) {
    throw new Error('Invalid media path');
  }

  let decoded;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    throw new Error('Invalid media path encoding');
  }

  if (decoded.includes('\0') || decoded.includes('\\')) {
    throw new Error('Invalid media path');
  }
  if (decoded.split('/').some((segment) => segment === '..' || segment === '.')) {
    throw new Error('Path traversal is not allowed');
  }

  const parsed = new URL(decoded, 'http://local.invalid');
  const pathname = parsed.pathname;

  if (!pathname.startsWith(PART_PATH_PREFIX)) {
    throw new Error('Only Plex library part paths are allowed');
  }

  if (pathname.split('/').some((segment) => segment === '..' || segment === '.')) {
    throw new Error('Path traversal is not allowed');
  }

  if (!/\/file(?:\.[a-z0-9]+)?$/i.test(pathname)) {
    throw new Error('Media path must point to a Plex file endpoint');
  }

  return pathname;
}

export function signMediaPath(mediaPath, expiresAt, secret) {
  const normalizedPath = normalizeMediaPath(mediaPath);
  const expires = Number.parseInt(String(expiresAt), 10);
  if (!Number.isInteger(expires) || expires <= 0) {
    throw new Error('Invalid expiration');
  }

  return createHmac('sha256', secret)
    .update(`v1\n${normalizedPath}\n${expires}`)
    .digest('base64url');
}

export function verifyMediaSignature({ mediaPath, expiresAt, signature, secret, now, maxTtlSeconds }) {
  const normalizedPath = normalizeMediaPath(mediaPath);
  const expires = Number.parseInt(String(expiresAt), 10);
  const currentTime = Number.isInteger(now) ? now : Math.floor(Date.now() / 1000);

  if (!Number.isInteger(expires)) {
    return { ok: false, reason: 'invalid_expiration' };
  }
  if (expires < currentTime) {
    return { ok: false, reason: 'expired' };
  }
  if (expires > currentTime + maxTtlSeconds) {
    return { ok: false, reason: 'expiration_too_far' };
  }
  if (typeof signature !== 'string' || signature.length === 0) {
    return { ok: false, reason: 'missing_signature' };
  }

  const expected = signMediaPath(normalizedPath, expires, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return { ok: false, reason: 'invalid_signature' };
  }

  return timingSafeEqual(expectedBuffer, actualBuffer)
    ? { ok: true, mediaPath: normalizedPath, expiresAt: expires }
    : { ok: false, reason: 'invalid_signature' };
}
