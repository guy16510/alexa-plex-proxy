import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_HOME_CONTENT, loadLaunchHome } from '../src/launch-home.js';

test('launch uses the cached snapshot when available', async () => {
  const snapshot = {
    recentAlbums: [{ title: 'Album' }],
    favorites: [],
    playlists: [],
    backgroundImage: 'bg'
  };
  const result = await loadLaunchHome({
    get: async () => ({ status: 'hit', content: snapshot, updatedAt: 1234 })
  }, { timeoutMs: 5 });
  assert.equal(result.source, 'snapshot');
  assert.equal(result.content, snapshot);
  assert.equal(result.snapshotUpdatedAt, 1234);
});

test('launch falls back to static content when the cache misses', async () => {
  const result = await loadLaunchHome({
    get: async () => ({ status: 'miss', content: null })
  }, { timeoutMs: 5 });
  assert.equal(result.source, 'fallback');
  assert.equal(result.reason, 'miss');
  assert.equal(result.content, EMPTY_HOME_CONTENT);
});

test('launch falls back when the snapshot store itself throws', async () => {
  const result = await loadLaunchHome({
    get: async () => { throw new Error('boom'); }
  }, { timeoutMs: 5 });
  assert.equal(result.source, 'fallback');
  assert.equal(result.reason, 'exception');
  assert.equal(result.content, EMPTY_HOME_CONTENT);
});

test('100 launch iterations always return usable home content across cache failures', async () => {
  let calls = 0;
  const store = {
    async get() {
      calls += 1;
      const mode = calls % 5;
      if (mode === 0) throw new Error('intermittent ddb failure');
      if (mode === 1) return { status: 'timeout', content: null };
      if (mode === 2) return { status: 'miss', content: null };
      if (mode === 3) return { status: 'invalid', content: null };
      return {
        status: 'hit',
        updatedAt: Date.now(),
        content: {
          recentAlbums: [{ title: `Album ${calls}` }],
          favorites: [],
          playlists: [],
          backgroundImage: ''
        }
      };
    }
  };

  const results = [];
  for (let index = 0; index < 100; index += 1) {
    results.push(await loadLaunchHome(store, { timeoutMs: 5 }));
  }

  assert.equal(results.length, 100);
  assert.equal(results.filter((result) => result.source === 'snapshot').length, 20);
  assert.equal(results.filter((result) => result.source === 'fallback').length, 80);
  for (const result of results) {
    assert.ok(Array.isArray(result.content.recentAlbums));
    assert.ok(Array.isArray(result.content.favorites));
    assert.ok(Array.isArray(result.content.playlists));
    assert.equal(typeof result.content.backgroundImage, 'string');
  }
});
