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

test('builds direct CloudFront URLs without exposing the Plex origin or token', () => {
  const url = new URL(client().buildAudioUrl({
    ratingKey: '123',
    partPath: '/library/parts/99/file.mp3',
    directPlayable: true
  }));
  assert.equal(url.hostname, 'example.cloudfront.net');
  assert.equal(url.pathname, '/library/parts/99/file.mp3');
  assert.equal(url.searchParams.has('X-Plex-Token'), false);
  assert.equal(url.href.includes('origin.plex.direct'), false);
  assert.equal(url.href.includes('secret-token'), false);
});

test('builds Plex MP3 transcode URLs without exposing the Plex token', () => {
  const url = new URL(client().buildAudioUrl({
    ratingKey: '456',
    partPath: '/library/parts/100/file.flac',
    directPlayable: false
  }, 'session-1'));
  assert.equal(url.pathname, '/audio/:/transcode/universal/start.mp3');
  assert.equal(url.searchParams.get('path'), '/library/metadata/456');
  assert.equal(url.searchParams.get('musicBitrate'), '192');
  assert.equal(url.searchParams.get('session'), 'session-1');
  assert.equal(url.searchParams.get('transcodeSessionId'), 'session-1');
  assert.equal(url.searchParams.get('X-Plex-Platform'), 'Web');
  assert.equal(url.searchParams.has('X-Plex-Token'), false);
});

test('builds high-resolution art and background sources without a token', () => {
  const plex = client();
  const art = plex.buildArtworkSources({
    thumbPath: '/library/metadata/1/thumb/1',
    artPath: '/library/metadata/1/art/1'
  }, { background: false });
  const background = plex.buildArtworkSources({
    thumbPath: '/library/metadata/1/thumb/1',
    artPath: '/library/metadata/1/art/1'
  }, { background: true });
  assert.equal(art.length, 2);
  assert.equal(new URL(art[0].url).searchParams.get('width'), '1200');
  assert.equal(new URL(art[0].url).searchParams.get('height'), '1200');
  assert.equal(new URL(background[0].url).searchParams.get('width'), '1920');
  assert.equal(new URL(background[0].url).searchParams.get('height'), '1080');
  assert.equal(JSON.stringify([...art, ...background]).includes('secret-token'), false);
});

test('normalizes direct-play, artwork, ratings, year, and timed lyric metadata', () => {
  const plex = client();
  const mp3 = plex.normalizeTrack({
    ratingKey: '1',
    title: 'Song',
    grandparentTitle: 'Artist',
    parentTitle: 'Album',
    parentYear: '1997',
    userRating: '8',
    thumb: '/thumb',
    art: '/art',
    Media: {
      audioCodec: 'mp3',
      bitrate: '320',
      Part: {
        id: '9',
        key: '/file.mp3',
        container: 'mp3',
        Stream: { streamType: '4', codec: 'lrc', key: '/library/streams/77', timed: '1' }
      }
    }
  });
  assert.equal(mp3.directPlayable, true);
  assert.equal(mp3.year, 1997);
  assert.equal(mp3.userRating, 8);
  assert.equal(mp3.lyricsKey, '/library/streams/77');
  assert.equal(mp3.lyricsTimed, true);
  assert.equal(mp3.artPath, '/art');
});

test('converts local Plex LRC lyrics to WebVTT', async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(new URL(url).pathname, '/library/streams/77');
    assert.equal(options.headers['X-Plex-Token'], 'secret-token');
    return new Response('[00:00.00]Hello\n[00:02.00]World', { status: 200 });
  };
  const plex = client({ fetchImpl, lyricsMode: 'plex' });
  const webvtt = await plex.getTimedLyrics({
    ratingKey: '1',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    durationMs: 4000,
    lyricsKey: '/library/streams/77',
    lyricsCodec: 'lrc',
    lyricsTimed: true
  });
  assert.match(webvtt, /^WEBVTT/);
  assert.match(webvtt, /Hello/);
  assert.match(webvtt, /World/);
});

test('redacts Plex tokens from diagnostic text', () => {
  assert.equal(redactPlexSecrets('GET /x?X-Plex-Token=actual-token'), 'GET /x?X-Plex-Token=[REDACTED]');
  assert.equal(redactPlexSecrets('X-Plex-Token: actual-token'), 'X-Plex-Token: [REDACTED]');
});
