import test from 'node:test';
import assert from 'node:assert/strict';
import { VisualPlexClient } from '../src/visual-plex-client.js';

function client() {
  return new VisualPlexClient({
    baseUrl: 'https://origin.plex.direct:32400',
    streamBaseUrl: 'https://cdn.example.test',
    token: 'secret',
    musicLibrary: 'Music'
  });
}

test('a single plausible Plex artist plays without unnecessary confirmation', async () => {
  const plex = client();
  plex.rankedCandidates = async () => [{
    item: { ratingKey: '1', title: 'Benson Boone', thumb: '/benson.jpg' },
    score: 0.67
  }];
  const result = await plex.decorateResult({
    kind: 'artist',
    title: 'Benson Boone',
    score: 0.67,
    tracks: [{ ratingKey: '10' }]
  }, 'artist', 'banson boon');
  assert.equal(result.needsConfirmation, false);
  assert.equal(result.alternatives.length, 1);
  assert.equal(result.alternatives[0].title, 'Benson Boone');
});

test('two close Plex matches trigger visual confirmation', async () => {
  const plex = client();
  plex.rankedCandidates = async () => [
    { item: { ratingKey: '1', title: 'Benson Boone', thumb: '/1.jpg' }, score: 0.64 },
    { item: { ratingKey: '2', title: 'Benson', thumb: '/2.jpg' }, score: 0.58 }
  ];
  const result = await plex.decorateResult({
    kind: 'artist',
    title: 'Benson Boone',
    score: 0.64,
    tracks: [{ ratingKey: '10' }]
  }, 'artist', 'banson');
  assert.equal(result.needsConfirmation, true);
  assert.equal(result.alternatives.length, 2);
  assert.ok(result.confidenceMargin < 0.16);
});

test('high-confidence matches never incur a confirmation lookup', async () => {
  const plex = client();
  plex.rankedCandidates = async () => {
    throw new Error('should not run');
  };
  const result = await plex.decorateResult({
    kind: 'artist',
    title: 'Benson Boone',
    score: 0.91,
    tracks: [{ ratingKey: '10' }]
  }, 'artist', 'Benson Boone');
  assert.equal(result.needsConfirmation, false);
  assert.deepEqual(result.alternatives, []);
});

test('home content degrades gracefully when one Plex section fails', async () => {
  const plex = client();
  plex.recentAlbums = async () => [{ title: 'Album', artUrl: 'bg' }];
  plex.favoriteTracks = async () => {
    throw new Error('favorites unavailable');
  };
  plex.visualPlaylists = async () => [{ title: 'Road Trip', artUrl: 'playlist-bg' }];
  const content = await plex.homeContent({ sectionTimeoutMs: 50 });
  assert.equal(content.recentAlbums.length, 1);
  assert.deepEqual(content.favorites, []);
  assert.equal(content.playlists.length, 1);
  assert.equal(content.backgroundImage, 'bg');
});

test('home content returns a valid empty model when every Plex section fails', async () => {
  const plex = client();
  plex.recentAlbums = async () => { throw new Error('recent failed'); };
  plex.favoriteTracks = async () => { throw new Error('favorites failed'); };
  plex.visualPlaylists = async () => { throw new Error('playlists failed'); };
  const content = await plex.homeContent({ sectionTimeoutMs: 50 });
  assert.deepEqual(content, {
    recentAlbums: [],
    favorites: [],
    playlists: [],
    backgroundImage: ''
  });
});

test('home content never waits indefinitely for Plex during Alexa launch', async () => {
  const plex = client();
  const never = () => new Promise(() => {});
  plex.recentAlbums = never;
  plex.favoriteTracks = never;
  plex.visualPlaylists = never;

  const startedAt = Date.now();
  const content = await plex.homeContent({ sectionTimeoutMs: 25 });
  const elapsedMs = Date.now() - startedAt;

  assert.ok(elapsedMs < 250, `homeContent took ${elapsedMs}ms`);
  assert.deepEqual(content, {
    recentAlbums: [],
    favorites: [],
    playlists: [],
    backgroundImage: ''
  });
});

test('home content tolerates repeated intermittent Plex failures', async () => {
  const plex = client();
  let call = 0;
  plex.recentAlbums = async () => {
    call += 1;
    if (call % 2 === 0) throw new Error('temporary failure');
    return [{ title: `Album ${call}`, artUrl: `bg-${call}` }];
  };
  plex.favoriteTracks = async () => [];
  plex.visualPlaylists = async () => [];

  for (let index = 0; index < 20; index += 1) {
    const content = await plex.homeContent({ sectionTimeoutMs: 50 });
    assert.ok(Array.isArray(content.recentAlbums));
    assert.ok(Array.isArray(content.favorites));
    assert.ok(Array.isArray(content.playlists));
    assert.equal(typeof content.backgroundImage, 'string');
  }
});
