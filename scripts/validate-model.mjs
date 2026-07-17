import { readFile } from 'node:fs/promises';

const document = JSON.parse(await readFile(new URL('../interaction-model/en-US.json', import.meta.url), 'utf8'));
const model = document?.interactionModel?.languageModel;
if (!model?.invocationName || !Array.isArray(model.intents)) {
  throw new Error('interaction-model/en-US.json must contain interactionModel.languageModel with intents');
}

const requiredIntents = [
  'PlaySongIntent',
  'PlayArtistIntent',
  'PlayAlbumIntent',
  'PlayPlaylistIntent',
  'PlayAnyIntent',
  'PlayGenreIntent',
  'PlayDecadeIntent',
  'PlayRadioIntent',
  'SkipTrackIntent',
  'SeekForwardIntent',
  'SeekBackwardIntent',
  'NowPlayingIntent',
  'LikeTrackIntent',
  'DislikeTrackIntent',
  'RateTrackIntent',
  'AddToPlaylistIntent',
  'DiagnosticsIntent'
];
const names = new Set(model.intents.map((intent) => intent.name));
for (const required of requiredIntents) {
  if (!names.has(required)) throw new Error(`Missing required intent: ${required}`);
}

const customTypes = new Set((model.types ?? []).map((type) => type.name));
for (const intent of model.intents) {
  if (!intent.name || !Array.isArray(intent.samples) || !Array.isArray(intent.slots ?? [])) {
    throw new Error(`Invalid intent structure: ${intent.name ?? 'unknown'}`);
  }
  const searchQuerySlots = (intent.slots ?? []).filter((slot) => slot.type === 'AMAZON.SearchQuery');
  if (searchQuerySlots.length > 1) {
    throw new Error(`${intent.name} has more than one AMAZON.SearchQuery slot`);
  }
  for (const slot of intent.slots ?? []) {
    if (!slot.name || !slot.type) throw new Error(`Invalid slot in ${intent.name}`);
    if (!slot.type.startsWith('AMAZON.') && !customTypes.has(slot.type)) {
      throw new Error(`${intent.name} references missing custom slot type ${slot.type}`);
    }
  }
}
console.log(`Alexa interaction model is valid (${model.intents.length} intents, ${customTypes.size} custom types).`);
