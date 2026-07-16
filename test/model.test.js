import test from 'node:test';
import assert from 'node:assert/strict';
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
