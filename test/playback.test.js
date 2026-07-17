import test from 'node:test';
import assert from 'node:assert/strict';
import { playDirective } from '../src/playback.js';
import { createQueue, tokenFor } from '../src/queue.js';

const track = {
  ratingKey: '42',
  title: 'Everlong',
  artist: 'Foo Fighters',
  album: 'The Colour and the Shape',
  partPath: '/library/parts/42/file.mp3',
  directPlayable: true
};

function mockPlex({ lyrics = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n' } = {}) {
  return {
    buildAudioUrl: () => 'https://example.cloudfront.net/audio.mp3',
    buildArtworkSources: (_track, { background }) => [
      { url: background ? 'https://example.cloudfront.net/background.jpg' : 'https://example.cloudfront.net/art.jpg' }
    ],
    getTimedLyrics: async () => lyrics
  };
}

test('builds rich metadata and synchronized lyrics', async () => {
  const queue = createQueue([track]);
  const directive = await playDirective({ queue, position: 0, plex: mockPlex() });
  assert.equal(directive.type, 'AudioPlayer.Play');
  assert.equal(directive.audioItem.stream.captionData.type, 'WEBVTT');
  assert.equal(directive.audioItem.metadata.title, 'Everlong');
  assert.equal(directive.audioItem.metadata.subtitle, 'Foo Fighters • The Colour and the Shape');
  assert.equal(directive.audioItem.metadata.art.sources[0].url.endsWith('/art.jpg'), true);
  assert.equal(directive.audioItem.metadata.backgroundImage.sources[0].url.endsWith('/background.jpg'), true);
  assert.equal('expectedPreviousToken' in directive.audioItem.stream, false);
});

test('ENQUEUE binds the expected previous token and tolerates missing lyrics', async () => {
  const queue = createQueue([track, { ...track, ratingKey: '43', title: 'Monkey Wrench' }]);
  const previousToken = tokenFor(queue, 0);
  const directive = await playDirective({
    queue,
    position: 1,
    plex: mockPlex({ lyrics: null }),
    behavior: 'ENQUEUE',
    expectedPreviousToken: previousToken
  });
  assert.equal(directive.audioItem.stream.expectedPreviousToken, previousToken);
  assert.equal('captionData' in directive.audioItem.stream, false);
});
