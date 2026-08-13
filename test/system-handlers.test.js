import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  ALEXA_SKILL_ID: 'amzn1.ask.skill.test',
  PLEX_URL: 'https://example.plex.direct:32400',
  PLEX_TOKEN: 'secret',
  STREAM_BASE_URL: 'https://example.cloudfront.net',
  QUEUE_TABLE: 'queues',
  PERSONALITY_MODE: 'clean'
});

const {
  ErrorHandler,
  SystemExceptionEncounteredHandler
} = await import('../src/handlers/system.js');
const {
  RequestDeadlineExceededError
} = await import('../src/request-deadline.js');

function input(request) {
  const response = {};
  return {
    requestEnvelope: { request },
    responseBuilder: {
      speak(value) {
        response.outputSpeech = { type: 'PlainText', text: value };
        return this;
      },
      getResponse() {
        return response;
      }
    }
  };
}

test('deadline errors produce a specific server-slow response', () => {
  const response = ErrorHandler.handle(
    input({ type: 'IntentRequest' }),
    new RequestDeadlineExceededError()
  );
  assert.match(response.outputSpeech.text, /Plex is taking too long/i);
  assert.doesNotMatch(response.outputSpeech.text, /could not find/i);
});

test('System.ExceptionEncountered logs redacted diagnostics and returns no speech', () => {
  const messages = [];
  const originalError = console.error;
  console.error = (...args) => messages.push(args);
  try {
    const handlerInput = input({
      type: 'System.ExceptionEncountered',
      requestId: 'request-1',
      cause: { requestId: 'cause-1' },
      error: {
        type: 'INVALID_RESPONSE',
        message: 'bad URL?X-Plex-Token=do-not-log'
      }
    });
    assert.equal(SystemExceptionEncounteredHandler.canHandle(handlerInput), true);
    assert.deepEqual(SystemExceptionEncounteredHandler.handle(handlerInput), {});
  } finally {
    console.error = originalError;
  }
  assert.equal(JSON.stringify(messages).includes('do-not-log'), false);
  assert.equal(JSON.stringify(messages).includes('cause-1'), true);
});
