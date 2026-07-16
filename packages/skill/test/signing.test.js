import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSignedStreamUrl, signMediaPath } from '../src/signing.js';

const PATH = '/library/parts/12345/1680000000/file.mp3';
const SECRET = 'this-is-a-test-secret-with-enough-entropy';

test('uses the same signing format as the gateway', () => {
  assert.equal(
    signMediaPath(PATH, 1_700_000_900, SECRET),
    'FkNeiK5p6O0kp0riiEKpShWuivKPzYklUBboTHSmUQI'
  );
});

test('builds an https stream URL without exposing the Plex token', () => {
  const url = new URL(buildSignedStreamUrl({
    baseUrl: 'https://music.example.com',
    mediaPath: PATH,
    secret: SECRET,
    ttlSeconds: 900,
    now: 1_700_000_000
  }));

  assert.equal(url.origin, 'https://music.example.com');
  assert.equal(url.pathname, '/v1/stream');
  assert.equal(url.searchParams.get('path'), PATH);
  assert.equal(url.searchParams.get('exp'), '1700000900');
  assert.equal(url.searchParams.has('X-Plex-Token'), false);
});
