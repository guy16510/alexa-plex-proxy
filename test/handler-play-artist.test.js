import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  ALEXA_SKILL_ID: 'amzn1.ask.skill.test',
  PLEX_URL: 'https://example.plex.direct:32400',
  PLEX_TOKEN: 'secret',
  STREAM_BASE_URL: 'https://example.cloudfront.net',
  QUEUE_TABLE: 'queues'
});

const {
  createPlayMediaIntentHandler
} = await import('../src/handlers/intents.js');
const {
  createVisualPlayMediaIntentHandler
} = await import('../src/visual-experience.js');

function responseBuilder() {
  const response = { directives: [] };
  return {
    speak(value) {
      response.outputSpeech = { type: 'PlainText', text: value };
      return this;
    },
    reprompt(value) {
      response.reprompt = { outputSpeech: { type: 'PlainText', text: value } };
      return this;
    },
    addDirective(value) {
      response.directives.push(value);
      return this;
    },
    withShouldEndSession(value) {
      response.shouldEndSession = value;
      return this;
    },
    getResponse() {
      return response;
    }
  };
}

function handlerInput({ apl }) {
  return {
    requestEnvelope: {
      context: {
        System: {
          user: { userId: 'user-1' },
          device: {
            supportedInterfaces: apl
              ? { 'Alexa.Presentation.APL': { runtime: { maxVersion: '2024.3' } } }
              : { AudioPlayer: {} }
          }
        }
      },
      request: {
        type: 'IntentRequest',
        intent: {
          name: 'PlayArtistIntent',
          slots: { query: { name: 'query', value: 'Harry Styles' } }
        }
      }
    },
    responseBuilder: responseBuilder()
  };
}

function dependencies(events) {
  const track = {
    ratingKey: '42',
    title: 'As It Was',
    artist: 'Harry Styles',
    album: "Harry's House",
    partPath: '/library/parts/42/file.mp3',
    directPlayable: true
  };
  return {
    plexClient: {
      async resolve() {
        events.push('resolved');
        return { kind: 'artist', title: 'Harry Styles', score: 1, tracks: [track] };
      },
      buildAudioUrl() {
        events.push('directive');
        return 'https://example.cloudfront.net/audio.mp3';
      },
      buildArtworkSources: () => [{ url: 'https://example.cloudfront.net/art.jpg' }],
      peekTimedLyrics: () => null,
      getTimedLyrics: () => new Promise(() => {})
    },
    store: {
      async getBlockedTrackIds() {
        events.push('blocked');
        return new Set();
      },
      async put() {
        events.push('persisted');
      }
    },
    responder: (key, values = {}) => `${key}:${values.title ?? values.query ?? ''}`,
    settings: { maxQueueTracks: 150, queueTtlHours: 24 }
  };
}

for (const [label, apl, factory] of [
  ['voice-only', false, createPlayMediaIntentHandler],
  ['APL-capable', true, createVisualPlayMediaIntentHandler]
]) {
  test(`${label} Harry Styles request plays without waiting for lyrics`, async () => {
    const events = [];
    const handler = factory(dependencies(events));
    const response = await handler.handle(handlerInput({ apl }));
    const play = response.directives.find((directive) => directive.type === 'AudioPlayer.Play');

    assert.ok(play);
    assert.equal(response.shouldEndSession, true);
    assert.equal('captionData' in play.audioItem.stream, false);
    assert.ok(events.indexOf('persisted') < events.indexOf('directive'));
  });
}

test('visual play handler does not intercept a voice-only request', () => {
  const handler = createVisualPlayMediaIntentHandler(dependencies([]));
  assert.equal(handler.canHandle(handlerInput({ apl: false })), false);
  assert.equal(handler.canHandle(handlerInput({ apl: true })), true);
});
