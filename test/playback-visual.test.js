import test from 'node:test';
import assert from 'node:assert/strict';
import { playDirective } from '../src/playback.js';
import { createQueue } from '../src/queue.js';

test('play directive applies persisted lyric timing offset without changing audio offset', async () => {
  const track = {
    ratingKey: '1',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    durationMs: 10000
  };
  const queue = createQueue([track]);
  queue.offsetMs = 2500;
  queue.lyricsOffsetMs = 1000;
  const plex = {
    buildAudioUrl: () => 'https://example.test/song.mp3',
    getTimedLyrics: async () => `WEBVTT

00:00:01.000 --> 00:00:03.000
Line
`,
    buildArtworkSources: () => [{ url: 'https://example.test/art.jpg' }]
  };
  const directive = await playDirective({ queue, position: 0, plex });
  assert.equal(directive.audioItem.stream.offsetInMilliseconds, 2500);
  assert.match(directive.audioItem.stream.captionData.content, /00:00:02\.000 --> 00:00:04\.000/);
});
