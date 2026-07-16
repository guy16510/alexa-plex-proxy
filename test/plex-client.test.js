import test from 'node:test';
import assert from 'node:assert/strict';
import { PlexClient, redactPlexSecrets } from '../src/plex-client.js';

function client(overrides = {}) {
  return new PlexClient({
    baseUrl: 'https://origin.plex.direct:32400',
    streamBaseUrl: 'https://example.cloudfront.net',
    token: 'secret-token',
    musicLibrary: 'Music',
    ...overrides
  });
}

test('builds direct CloudFront URLs without exposing the Plex origin', () => {
  const url = new URL(client().buildAudioUrl({
    ratingKey: '123',
    partPath: '/library/parts/99/file.mp3',
    directPlayable: true
  }));
  assert.equal(url.hostname, 'example.cloudfront.net');
  assert.equal(url.pathname, '/library/parts/99/file.mp3');
  assert.equal(url.searchParams.get('X-Plex-Token'), 'secret-token');
  assert.equal(url.href.includes('origin.plex.direct'), false);
});

test('builds Plex MP3 transcode URLs for unsupported audio', () => {
  const url = new URL(client().buildAudioUrl({
    ratingKey: '456',
    partPath: '/library/parts/100/file.flac',
    directPlayable: false
  }, 'session-1'));
  assert.equal(url.pathname, '/music/:/transcode/universal/start.mp3');
  assert.equal(url.searchParams.get('path'), '/library/metadata/456');
  assert.equal(url.searchParams.get('maxAudioBitrate'), '192');
  assert.equal(url.searchParams.get('session'), 'session-1');
});

test('normalizes direct-play and transcode metadata', () => {
  const plex = client();
  const mp3 = plex.normalizeTrack({
    ratingKey: '1',
    title: 'Song',
    grandparentTitle: 'Artist',
    parentTitle: 'Album',
    Media: { audioCodec: 'mp3', bitrate: '320', Part: { key: '/file.mp3', container: 'mp3' } }
  });
  const flac = plex.normalizeTrack({
    ratingKey: '2',
    title: 'Lossless',
    Media: { audioCodec: 'flac', Part: { key: '/file.flac', container: 'flac' } }
  });
  assert.equal(mp3.directPlayable, true);
  assert.equal(flac.directPlayable, false);
});

test('redacts Plex tokens from diagnostic text', () => {
  assert.equal(redactPlexSecrets('GET /x?X-Plex-Token=actual-token'), 'GET /x?X-Plex-Token=[REDACTED]');
  assert.equal(redactPlexSecrets('X-Plex-Token: actual-token'), 'X-Plex-Token: [REDACTED]');
});
