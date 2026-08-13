import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

test('Alexa interaction model is valid JSON with required playback intents', async () => {
  const document = JSON.parse(await readFile(new URL('../interaction-model/en-US.json', import.meta.url), 'utf8'));
  const intents = document.interactionModel.languageModel.intents;
  const names = new Set(intents.map((intent) => intent.name));
  for (const name of ['PlaySongIntent', 'PlayArtistIntent', 'PlayAlbumIntent', 'PlayPlaylistIntent', 'PlayAnyIntent']) {
    assert.ok(names.has(name), `${name} is required`);
  }
  assert.ok(intents.every((intent) => Array.isArray(intent.samples)));
});

test('Alexa interaction model uses Burns Jukebox without changing intents or custom types', async () => {
  const document = JSON.parse(await readFile(new URL('../interaction-model/en-US.json', import.meta.url), 'utf8'));
  const model = document.interactionModel.languageModel;
  assert.equal(model.invocationName, 'burns jukebox');
  assert.notEqual(model.invocationName, 'server music');

  const stableModel = { ...model };
  delete stableModel.invocationName;
  assert.equal(
    createHash('sha256').update(JSON.stringify(stableModel)).digest('hex'),
    'ed6896fe1067b6449029d3368872b7308a301c14d6786ec8dbde6c6851a8536e',
    'intent samples and custom types must remain unchanged during the rename'
  );
});

test('deployment pushes, waits for, and verifies the Alexa interaction model', async () => {
  const deployScript = await readFile(new URL('../scripts/deploy.mjs', import.meta.url), 'utf8');
  const alexaScript = await readFile(new URL('../scripts/deploy-alexa.mjs', import.meta.url), 'utf8');
  const verifyScript = await readFile(new URL('../scripts/verify-deployment.mjs', import.meta.url), 'utf8');
  assert.match(deployScript, /scripts\/deploy-alexa\.mjs/);
  assert.match(deployScript, /scripts\/verify-deployment\.mjs/);
  assert.match(alexaScript, /set-interaction-model/);
  assert.match(alexaScript, /get-interaction-model-metadata/);
  assert.match(verifyScript, /get-interaction-model/);
  assert.match(verifyScript, /modelHash\(local\) !== modelHash\(deployedModel\)/);
});
