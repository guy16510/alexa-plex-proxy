import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const template = await readFile(new URL('../template.yaml', import.meta.url), 'utf8');

test('keeps the default audio behavior uncached', () => {
  assert.match(template, /PlexNoCachePolicy:[\s\S]*?DefaultTTL: 0[\s\S]*?MaxTTL: 0/);
  assert.match(template, /DefaultCacheBehavior:[\s\S]*?CachePolicyId: !Ref PlexNoCachePolicy/);
});

test('caches only deterministic Plex artwork transcodes', () => {
  assert.match(template, /PlexArtworkCachePolicy:/);
  assert.match(template, /DefaultTTL: 86400/);
  assert.match(template, /MaxTTL: 604800/);
  assert.match(template, /PathPattern: '\/photo\/:\/transcode\*'/);
  assert.match(template, /PathPattern: '\/photo\/:\/transcode\*'[\s\S]*?CachePolicyId: !Ref PlexArtworkCachePolicy/);
});

test('artwork cache key includes every Plex image transformation parameter', () => {
  const artworkPolicy = template.slice(
    template.indexOf('PlexArtworkCachePolicy:'),
    template.indexOf('PlexOriginRequestPolicy:')
  );
  assert.match(artworkPolicy, /QueryStringBehavior: all/);
});
