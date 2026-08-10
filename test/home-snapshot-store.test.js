import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeSnapshotStore, HOME_SNAPSHOT_KEY } from '../src/home-snapshot-store.js';

function storeWith(send) {
  return new HomeSnapshotStore({
    tableName: 'test-table',
    client: { send }
  });
}

test('home snapshot store returns a normalized cache hit', async () => {
  const store = storeWith(async () => ({
    Item: {
      updatedAt: 1234,
      homeSnapshot: {
        recentAlbums: [{ title: 'Album' }],
        favorites: [{ title: 'Song' }],
        playlists: [{ title: 'Mix' }],
        backgroundImage: 'https://example.test/bg.jpg'
      }
    }
  }));
  const result = await store.get({ timeoutMs: 50 });
  assert.equal(result.status, 'hit');
  assert.equal(result.updatedAt, 1234);
  assert.equal(result.content.recentAlbums[0].title, 'Album');
});

test('home snapshot store times out quickly when DynamoDB never resolves', async () => {
  const store = storeWith(() => new Promise(() => {}));
  const startedAt = Date.now();
  const result = await store.get({ timeoutMs: 10 });
  assert.equal(result.status, 'timeout');
  assert.ok(Date.now() - startedAt < 100);
});

test('home snapshot store converts DynamoDB errors into a fallback status', async () => {
  const store = storeWith(async () => {
    throw new Error('ddb unavailable');
  });
  const result = await store.get({ timeoutMs: 50 });
  assert.equal(result.status, 'error');
  assert.equal(result.content, null);
});

test('home snapshot store rejects malformed cached payloads', async () => {
  const store = storeWith(async () => ({ Item: { homeSnapshot: 'broken' } }));
  const result = await store.get({ timeoutMs: 50 });
  assert.equal(result.status, 'invalid');
  assert.equal(result.content, null);
});

test('home snapshot store writes a reserved non-expiring snapshot record', async () => {
  let input;
  const store = storeWith(async (command) => {
    input = command.input;
    return {};
  });
  await store.put({
    recentAlbums: [{ title: 'Album' }],
    favorites: [],
    playlists: [],
    backgroundImage: ''
  });
  assert.equal(input.Item.userId, HOME_SNAPSHOT_KEY);
  assert.equal(input.Item.schemaVersion, 1);
  assert.equal(input.Item.expiresAt, undefined);
  assert.equal(input.Item.homeSnapshot.recentAlbums.length, 1);
});
