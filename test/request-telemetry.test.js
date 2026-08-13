import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RequestTelemetryInterceptor,
  ResponseTelemetryInterceptor,
  instrumentHandler,
  setApplicationIdValidation,
  setLaunchFallback
} from '../src/request-telemetry.js';

function launchInput() {
  return {
    requestEnvelope: {
      session: { new: true },
      request: { type: 'LaunchRequest', requestId: 'req-1', timestamp: '2026-08-13T10:00:00Z' },
      context: {
        System: {
          device: {
            deviceId: 'complete-private-device-id-abcdef12',
            supportedInterfaces: { AudioPlayer: {}, 'Alexa.Presentation.APL': {} }
          }
        },
        Viewport: { pixelWidth: 960, pixelHeight: 480, shape: 'RECTANGLE', dpi: 160 }
      }
    }
  };
}

test('request telemetry records safe structured context, handler, response, and EMF metrics', async () => {
  const input = launchInput();
  const messages = [];
  const original = console.log;
  console.log = (message) => messages.push(message);
  try {
    RequestTelemetryInterceptor.process(input);
    setApplicationIdValidation(input, true);
    setLaunchFallback(input, 'miss');
    const handler = instrumentHandler('TestLaunchHandler', {
      canHandle: () => true,
      handle: () => ({ directives: [{ type: 'Alexa.Presentation.APL.RenderDocument' }], shouldEndSession: false })
    });
    const response = await handler.handle(input);
    ResponseTelemetryInterceptor.process(input, response);
  } finally {
    console.log = original;
  }
  const complete = JSON.parse(messages.at(-1));
  assert.equal(complete.handlerSelected, 'TestLaunchHandler');
  assert.equal(complete.applicationIdValid, true);
  assert.equal(complete.LaunchReceived, 1);
  assert.equal(complete.LaunchSuccess, 1);
  assert.equal(complete.LaunchFallback, 1);
  assert.deepEqual(complete.responseDirectiveTypes, ['Alexa.Presentation.APL.RenderDocument']);
  assert.equal(complete.deviceIdSuffix, 'abcdef12');
  assert.doesNotMatch(messages.join('\n'), /complete-private-device-id/);
});
