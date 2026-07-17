import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

const valid = {
  ALEXA_SKILL_ID: 'amzn1.ask.skill.test',
  PLEX_URL: 'https://example.plex.direct:32400',
  PLEX_TOKEN: 'token',
  STREAM_BASE_URL: 'https://example.cloudfront.net',
  QUEUE_TABLE: 'queues'
};

test('loads enhanced defaults for a valid serverless configuration', () => {
  const config = loadConfig(valid);
  assert.equal(config.maxQueueTracks, 150);
  assert.equal(config.transcodePolicy, 'auto');
  assert.equal(config.lyricsMode, 'plex-lrclib');
  assert.equal(config.personalityMode, 'spicy');
  assert.equal(config.radioTrackLimit, 50);
  assert.equal(config.allowPlaylistWrites, true);
});

test('supports clean mode, Plex-only lyrics, and disabled playlist writes', () => {
  const config = loadConfig({
    ...valid,
    PERSONALITY_MODE: 'clean',
    LYRICS_MODE: 'plex',
    ALLOW_PLAYLIST_WRITES: 'false'
  });
  assert.equal(config.personalityMode, 'clean');
  assert.equal(config.lyricsMode, 'plex');
  assert.equal(config.allowPlaylistWrites, false);
});

test('rejects invalid endpoints and feature flags', () => {
  assert.throws(() => loadConfig({ ...valid, PLEX_URL: 'http://example.com' }), /HTTPS/);
  assert.throws(() => loadConfig({ ...valid, STREAM_BASE_URL: 'http://example.com' }), /HTTPS/);
  assert.throws(() => loadConfig({ ...valid, PERSONALITY_MODE: 'feral' }), /PERSONALITY_MODE/);
  assert.throws(() => loadConfig({ ...valid, ALLOW_PLAYLIST_WRITES: 'perhaps' }), /true or false/);
});
