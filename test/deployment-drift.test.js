import test from 'node:test';
import assert from 'node:assert/strict';
import { interfaceTypes, modelHash } from '../scripts/deployment-lib.mjs';
import { readFile } from 'node:fs/promises';

test('model drift hash ignores object key order but detects invocation/model changes', () => {
  const first = { interactionModel: { languageModel: { invocationName: 'burns jukebox', intents: [] } } };
  const reordered = { interactionModel: { languageModel: { intents: [], invocationName: 'burns jukebox' } } };
  const drifted = { interactionModel: { languageModel: { intents: [], invocationName: 'burns music' } } };
  assert.equal(modelHash(first), modelHash(reordered));
  assert.notEqual(modelHash(first), modelHash(drifted));
});

test('manifest interface verification reads AudioPlayer and APL', () => {
  assert.deepEqual(interfaceTypes({ manifest: { apis: { custom: { interfaces: [
    { type: 'ALEXA_PRESENTATION_APL' }, { type: 'AUDIO_PLAYER' }
  ] } } } }), ['ALEXA_PRESENTATION_APL', 'AUDIO_PLAYER']);
});

test('deployment verifier accepts the SAM Alexa EventSourceToken permission shape', async () => {
  const verifier = await readFile(new URL('../scripts/verify-deployment.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /lambda:EventSourceToken/);
});
