import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const visualExperience = await readFile(new URL('../src/visual-experience.js', import.meta.url), 'utf8');
const visualPlexClient = await readFile(new URL('../src/visual-plex-client.js', import.meta.url), 'utf8');

test('visual launch still routes through the established home renderer', () => {
  assert.match(visualExperience, /VisualLaunchRequestHandler[\s\S]*renderHome\(handlerInput, \{ speak: respond\('launch'\) \}\)/);
});

test('launch hardening is isolated from radio and lyric controls', () => {
  assert.match(visualExperience, /if \(action === 'radio'\)[\s\S]*plex\.radioForTrack\(track\)/);
  assert.match(visualExperience, /if \(action === 'lyricsOffset'\)/);
  assert.match(visualExperience, /queue\.lyricsOffsetMs/);
});

test('Plex home sections have an explicit bounded launch budget', () => {
  assert.match(visualPlexClient, /HOME_SECTION_TIMEOUT_MS = 750/);
  assert.match(visualPlexClient, /Promise\.race\(\[lookup, timeout\]\)/);
  assert.match(visualPlexClient, /boundedHomeSection\(\(\) => this\.recentAlbums\(\)/);
  assert.match(visualPlexClient, /boundedHomeSection\(\(\) => this\.favoriteTracks\(\)/);
  assert.match(visualPlexClient, /boundedHomeSection\(\(\) => this\.visualPlaylists\(\)/);
});
