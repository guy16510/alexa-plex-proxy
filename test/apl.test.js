import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aplDirective,
  confirmationDocument,
  homeDocument,
  lyricsDocument,
  queueDocument,
  supportsApl
} from '../src/apl.js';

function serialized(value) {
  return JSON.stringify(value);
}

test('detects APL support without assuming every Echo has a screen', () => {
  assert.equal(supportsApl({ requestEnvelope: { context: { System: { device: { supportedInterfaces: {
    'Alexa.Presentation.APL': {}
  } } } } } }), true);
  assert.equal(supportsApl({ requestEnvelope: { context: { System: { device: { supportedInterfaces: {} } } } } }), false);
});

test('home document is optimized for Echo Show 5 and uses Plex cards', () => {
  const document = homeDocument({
    backgroundImage: 'https://example.test/background.jpg',
    recentAlbums: [{
      kind: 'album',
      query: 'Fireworks & Rollerblades',
      title: 'Fireworks & Rollerblades',
      subtitle: 'Benson Boone',
      imageUrl: 'https://example.test/album.jpg'
    }],
    favorites: [],
    playlists: []
  });
  const json = serialized(document);
  assert.match(json, /hubLandscapeSmall/);
  assert.match(json, /Fireworks & Rollerblades/);
  assert.match(json, /Benson Boone/);
  assert.match(json, /"SendEvent"/);
  assert.match(json, /"play","album","Fireworks & Rollerblades"/);
});

test('queue document exposes large touch controls and clickable queue rows', () => {
  const document = queueDocument({
    queue: {
      index: 0,
      tracks: [
        { title: 'Beautiful Things', artist: 'Benson Boone', durationLabel: '3:00' },
        { title: 'Slow It Down', artist: 'Benson Boone', durationLabel: '2:42' }
      ]
    },
    track: { title: 'Beautiful Things', artist: 'Benson Boone' },
    artUrl: 'https://example.test/art.jpg',
    backgroundImage: 'https://example.test/bg.jpg'
  });
  const json = serialized(document);
  for (const expected of ['favorite', 'ban', 'radio', 'showLyrics', 'queueSelect', 'seek', 'Previous', 'Next']) {
    assert.match(json, new RegExp(expected));
  }
});

test('lyrics document schedules synchronized line changes and sync controls', () => {
  const document = lyricsDocument({
    track: { title: 'Beautiful Things', artist: 'Benson Boone' },
    artUrl: 'https://example.test/art.jpg',
    currentLine: 'Please stay',
    nextLine: 'I want you',
    timeline: [{
      delayMs: 1200,
      previousLine: 'Please stay',
      currentLine: 'I want you',
      nextLine: 'I need you'
    }]
  });
  const json = serialized(document);
  assert.match(json, /"Sequential"/);
  assert.match(json, /"SetValue"/);
  assert.match(json, /currentLyric/);
  assert.match(json, /lyricsOffset/);
  assert.match(json, /1200/);
});

test('confirmation document limits choices to Plex alternatives', () => {
  const document = confirmationDocument({
    query: 'banson boon',
    alternatives: [
      { kind: 'artist', query: 'Benson Boone', title: 'Benson Boone', imageUrl: 'https://example.test/1.jpg' },
      { kind: 'artist', query: 'Benson', title: 'Benson', imageUrl: 'https://example.test/2.jpg' }
    ]
  });
  const json = serialized(document);
  assert.match(json, /banson boon/);
  assert.match(json, /Benson Boone/);
  assert.match(json, /"play","artist","Benson Boone"/);
  assert.equal(document.mainTemplate.item.items[1].items[2].items.length, 2);
});

test('APL directive preserves document token and data sources', () => {
  const directive = aplDirective({ type: 'APL' }, { test: { value: 1 } }, 'screen-token');
  assert.equal(directive.type, 'Alexa.Presentation.APL.RenderDocument');
  assert.equal(directive.token, 'screen-token');
  assert.equal(directive.datasources.test.value, 1);
});
