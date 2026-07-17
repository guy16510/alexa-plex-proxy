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
  const content = await plex.homeContent();
  assert.equal(content.recentAlbums.length, 1);
  assert.deepEqual(content.favorites, []);
  assert.equal(content.playlists.length, 1);
  assert.equal(content.backgroundImage, 'bg');
});
