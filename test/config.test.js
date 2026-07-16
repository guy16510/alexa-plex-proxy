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

test('loads defaults for a valid serverless configuration', () => {
  const config = loadConfig(valid);
  assert.equal(config.maxQueueTracks, 150);
  assert.equal(config.transcodePolicy, 'auto');
});

test('rejects non-HTTPS Plex and stream endpoints', () => {
  assert.throws(() => loadConfig({ ...valid, PLEX_URL: 'http://example.com' }), /HTTPS/);
  assert.throws(() => loadConfig({ ...valid, STREAM_BASE_URL: 'http://example.com' }), /HTTPS/);
});
