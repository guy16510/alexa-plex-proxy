import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshHomeSnapshot } from '../src/home-refresh-service.js';

function silentLogger() {
  return { info() {}, warn() {} };
}

test('home refresh writes a complete successful snapshot', async () => {
  let saved;
  const result = await refreshHomeSnapshot({
    plex: {
      recentAlbums: async () => [{ title: 'Album', artUrl: 'album-bg' }],
      favoriteTracks: async () => [{ title: 'Song' }],
      visualPlaylists: async () => [{ title: 'Mix' }]
    },
    store: {
      put: async (content) => {
        saved = content;
        return { updatedAt: 1234, content };
      }
    },
    timeoutMs: 50,
    logger: silentLogger()
  });
  assert.equal(result.updated, true);
  assert.equal(saved.backgroundImage, 'album-bg');
  assert.equal(saved.recentAlbums.length, 1);
  assert.equal(saved.favorites.length, 1);
  assert.equal(saved.playlists.length, 1);
});

test('home refresh writes partial data when only some Plex sections succeed', async () => {
  let saved;
  const result = await refreshHomeSnapshot({
    plex: {
      recentAlbums: async () => [{ title: 'Album' }],
      favoriteTracks: async () => { throw new Error('favorites failed'); },
      visualPlaylists: async () => new Promise(() => {})
    },
    store: {
      put: async (content) => {
        saved = content;
        return { updatedAt: 1234, content };
      }
    },
    timeoutMs: 10,
    logger: silentLogger()
  });
  assert.equal(result.updated, true);
  assert.deepEqual(result.outcomes, ['ok', 'error', 'timeout']);
  assert.equal(saved.recentAlbums.length, 1);
  assert.deepEqual(saved.favorites, []);
  assert.deepEqual(saved.playlists, []);
});

test('home refresh preserves the last-known-good snapshot when every section is unavailable', async () => {
  let writes = 0;
  const result = await refreshHomeSnapshot({
    plex: {
      recentAlbums: async () => { throw new Error('recent failed'); },
      favoriteTracks: async () => new Promise(() => {}),
      visualPlaylists: async () => { throw new Error('playlists failed'); }
    },
    store: {
      put: async () => { writes += 1; }
    },
    timeoutMs: 10,
    logger: silentLogger()
  });
  assert.equal(result.updated, false);
  assert.equal(result.reason, 'all-sections-unavailable');
  assert.equal(writes, 0);
});

test('an intentionally empty Plex library still refreshes because the calls succeeded', async () => {
  let writes = 0;
  const result = await refreshHomeSnapshot({
    plex: {
      recentAlbums: async () => [],
      favoriteTracks: async () => [],
      visualPlaylists: async () => []
    },
    store: {
      put: async () => {
        writes += 1;
        return { updatedAt: 99 };
      }
    },
    timeoutMs: 50,
    logger: silentLogger()
  });
  assert.equal(result.updated, true);
  assert.equal(writes, 1);
});
