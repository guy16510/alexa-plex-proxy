import test from 'node:test';
import assert from 'node:assert/strict';
import { EnhancedPlexClient } from '../src/enhanced-plex-client.js';

function client() {
  return new EnhancedPlexClient({
    baseUrl: 'https://origin.plex.direct:32400',
    streamBaseUrl: 'https://example.cloudfront.net',
    token: 'secret-token',
    musicLibrary: 'Music'
  });
}

function rawTrack({ ratingKey, title, artist, userRating }) {
  return {
    ratingKey,
    title,
    grandparentTitle: artist,
    parentTitle: 'Album',
    ...(userRating === undefined ? {} : { userRating }),
    Media: {
      audioCodec: 'mp3',
      bitrate: '192',
      Part: { key: `/library/parts/${ratingKey}/file.mp3`, container: 'mp3' }
    }
  };
}

function mockArtistLibrary(plex, artists, tracksByArtist) {
  plex.getMusicSectionKey = async () => '1';
  plex.request = async (path, params = {}) => {
    if (path === '/library/sections/1/all' && params.type === 8 && !params.title) {
      return { Directory: artists };
    }
    if (path === '/library/sections/1/all' || path === '/library/sections/1/search') return {};
    const artistMatch = /^\/library\/metadata\/(.+)\/allLeaves$/.exec(path);
    if (artistMatch) return { Track: tracksByArtist[artistMatch[1]] ?? [] };
    throw new Error(`Unexpected request: ${path}`);
  };
}

test('finds Benson Boone from a phonetic Alexa transcription', async () => {
  const plex = client();
  mockArtistLibrary(plex, [
    { ratingKey: '100', title: 'Benson Boone' },
    { ratingKey: '200', title: 'Ben Folds' }
  ], {
    100: [rawTrack({ ratingKey: '1', title: 'Beautiful Things', artist: 'Benson Boone' })]
  });

  const result = await plex.resolve('artist', 'banson boon');
  assert.equal(result.title, 'Benson Boone');
  assert.equal(result.tracks[0].artist, 'Benson Boone');
});

test('handles American spelling for The Neighbourhood', async () => {
  const plex = client();
  mockArtistLibrary(plex, [
    { ratingKey: '300', title: 'The Neighbourhood' },
    { ratingKey: '400', title: 'Neighborhood Brats' }
  ], {
    300: [rawTrack({ ratingKey: '2', title: 'Sweater Weather', artist: 'The Neighbourhood' })]
  });

  const result = await plex.resolve('artist', 'Neighborhood');
  assert.equal(result.title, 'The Neighbourhood');
});

test('explicit zero ratings are blocked from future queues', async () => {
  const plex = client();
  mockArtistLibrary(plex, [{ ratingKey: '500', title: 'Test Artist' }], {
    500: [
      rawTrack({ ratingKey: '3', title: 'Never Again', artist: 'Test Artist', userRating: '0' }),
      rawTrack({ ratingKey: '4', title: 'Keep This', artist: 'Test Artist' })
    ]
  });

  const result = await plex.resolve('artist', 'Test Artist');
  assert.deepEqual(result.tracks.map((track) => track.title), ['Keep This']);
  assert.equal(result.tracks[0].userRating, null);
});
