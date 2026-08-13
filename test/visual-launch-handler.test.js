import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  ALEXA_SKILL_ID: 'amzn1.ask.skill.test',
  PLEX_URL: 'https://example.plex.direct:32400',
  PLEX_TOKEN: 'secret',
  STREAM_BASE_URL: 'https://example.cloudfront.net',
  QUEUE_TABLE: 'queues'
});

const { createVisualLaunchRequestHandler } = await import('../src/visual-experience.js');

function input() {
  const response = { directives: [] };
  return {
    requestEnvelope: {
      request: { type: 'LaunchRequest', requestId: 'launch-test' },
      context: { System: { device: { supportedInterfaces: { 'Alexa.Presentation.APL': {} } } } }
    },
    responseBuilder: {
      speak(text) { response.outputSpeech = { text }; return this; },
      reprompt(text) { response.reprompt = { text }; return this; },
      getResponse() { return response; }
    }
  };
}

test('APL launch renders a snapshot without Plex and stays comfortably under 500 ms', async () => {
  let rendered;
  const handler = createVisualLaunchRequestHandler({
    snapshotStore: { get: async () => ({ status: 'hit', content: { recentAlbums: [], favorites: [], playlists: [], backgroundImage: '' } }) },
    responder: () => 'ready',
    homeRenderer: async (_input, options) => { rendered = options; return { directives: [{ type: 'Alexa.Presentation.APL.RenderDocument' }] }; }
  });
  const started = performance.now();
  const originalLog = console.log;
  console.log = () => {};
  try {
    for (let index = 0; index < 101; index += 1) await handler.handle(input());
  } finally {
    console.log = originalLog;
  }
  assert.ok(performance.now() - started < 500);
  assert.equal(rendered.speak, 'ready');
  assert.ok(rendered.content);
});

test('APL rendering failure deterministically returns speech-only launch', async () => {
  const handler = createVisualLaunchRequestHandler({
    snapshotStore: { get: async () => ({ status: 'miss' }) },
    responder: () => 'ready',
    homeRenderer: async () => { throw new Error('bad APL'); }
  });
  const response = await handler.handle(input());
  assert.equal(response.outputSpeech.text, 'ready');
  assert.match(response.reprompt.text, /What should I play/);
});
