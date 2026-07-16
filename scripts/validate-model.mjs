import { readFile } from 'node:fs/promises';

const document = JSON.parse(await readFile(new URL('../interaction-model/en-US.json', import.meta.url), 'utf8'));
const model = document?.interactionModel?.languageModel;
if (!model?.invocationName || !Array.isArray(model.intents)) {
  throw new Error('interaction-model/en-US.json must contain interactionModel.languageModel with intents');
}
const names = new Set(model.intents.map((intent) => intent.name));
for (const required of ['PlaySongIntent', 'PlayArtistIntent', 'PlayAlbumIntent', 'PlayPlaylistIntent', 'PlayAnyIntent', 'NowPlayingIntent']) {
  if (!names.has(required)) throw new Error(`Missing required intent: ${required}`);
}
for (const intent of model.intents) {
  if (!intent.name || !Array.isArray(intent.samples) || !Array.isArray(intent.slots ?? [])) {
    throw new Error(`Invalid intent structure: ${intent.name ?? 'unknown'}`);
  }
}
console.log(`Alexa interaction model is valid (${model.intents.length} intents).`);
