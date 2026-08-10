import test from 'node:test';
import assert from 'node:assert/strict';
import { recordVisualLaunchTelemetry } from '../src/launch-telemetry.js';

test('visual launch telemetry emits CloudWatch EMF without full device identifiers', () => {
  const original = console.log;
  let emitted;
  console.log = (value) => { emitted = value; };
  try {
    recordVisualLaunchTelemetry({
      requestEnvelope: {
        request: { requestId: 'request-123' },
        context: {
          System: {
            device: {
              deviceId: 'amzn-device-super-secret-12345678',
              supportedInterfaces: { 'Alexa.Presentation.APL': {} }
            }
          },
          Viewport: { pixelWidth: 960, pixelHeight: 480 }
        }
      },
      latencyMs: 42,
      success: true,
      fallback: false,
      reason: 'hit',
      snapshotUpdatedAt: Date.now() - 1000
    });
  } finally {
    console.log = original;
  }

  const payload = JSON.parse(emitted);
  assert.equal(payload._aws.CloudWatchMetrics[0].Namespace, 'BurnsJukebox');
  assert.equal(payload.LaunchSuccess, 1);
  assert.equal(payload.LaunchFailure, 0);
  assert.equal(payload.LaunchLatency, 42);
  assert.equal(payload.requestId, 'request-123');
  assert.equal(payload.deviceIdSuffix, '12345678');
  assert.equal(payload.viewport, '960x480');
  assert.doesNotMatch(emitted, /amzn-device-super-secret/);
});
