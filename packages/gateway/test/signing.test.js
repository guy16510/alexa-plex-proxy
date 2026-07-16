import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMediaPath, signMediaPath, verifyMediaSignature } from '../src/signing.js';

const SECRET = 'this-is-a-test-secret-with-enough-entropy';
const PATH = '/library/parts/12345/1680000000/file.mp3';

test('signs and verifies a Plex media path', () => {
  const signature = signMediaPath(PATH, 1_700_000_900, SECRET);
  const result = verifyMediaSignature({
    mediaPath: PATH,
    expiresAt: 1_700_000_900,
    signature,
    secret: SECRET,
    now: 1_700_000_000,
    maxTtlSeconds: 3_600
  });

  assert.deepEqual(result, {
    ok: true,
    mediaPath: PATH,
    expiresAt: 1_700_000_900
  });
});

test('rejects expired and overlong URLs', () => {
  const signature = signMediaPath(PATH, 1_700_000_900, SECRET);

  assert.equal(
    verifyMediaSignature({
      mediaPath: PATH,
      expiresAt: 1_700_000_900,
      signature,
      secret: SECRET,
      now: 1_700_001_000,
      maxTtlSeconds: 3_600
    }).reason,
    'expired'
  );

  assert.equal(
    verifyMediaSignature({
      mediaPath: PATH,
      expiresAt: 1_700_000_900,
      signature,
      secret: SECRET,
      now: 1_699_000_000,
      maxTtlSeconds: 3_600
    }).reason,
    'expiration_too_far'
  );
});

test('rejects traversal and non-media paths', () => {
  assert.throws(() => normalizeMediaPath('/library/metadata/1'));
  assert.throws(() => normalizeMediaPath('/library/parts/1/../metadata/file.mp3'));
});
