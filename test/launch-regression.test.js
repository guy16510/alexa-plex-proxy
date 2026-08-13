import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const visualExperience = await readFile(new URL('../src/visual-experience.js', import.meta.url), 'utf8');
const visualPlexClient = await readFile(new URL('../src/visual-plex-client.js', import.meta.url), 'utf8');
const template = await readFile(new URL('../template.yaml', import.meta.url), 'utf8');
const index = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');

function visualLaunchBlock() {
  const match = visualExperience.match(/export function createVisualLaunchRequestHandler[\s\S]*?export const VisualLaunchRequestHandler/);
  assert.ok(match, 'Visual launch handler factory must exist');
  return match[0];
}

test('visual launch reads only the cached home snapshot before rendering', () => {
  const launch = visualLaunchBlock();
  assert.match(launch, /snapshotStore = homeSnapshotStore/);
  assert.match(launch, /loadLaunchHome\(snapshotStore\)/);
  assert.match(launch, /content: launchHome\.content/);
  assert.doesNotMatch(launch, /plex\.homeContent/);
  assert.doesNotMatch(launch, /recentAlbums|favoriteTracks|visualPlaylists/);
});

test('visual launch has a speech-only final fallback if APL rendering fails', () => {
  const launch = visualLaunchBlock();
  assert.match(launch, /Visual launch rendering failed, using speech-only fallback/);
  assert.match(launch, /reprompt\('What should I play from Plex\?'\)/);
});

test('launch hardening is isolated from radio and lyric controls', () => {
  assert.match(visualExperience, /if \(action === 'radio'\)[\s\S]*plex\.radioForTrack\(track\)/);
  assert.match(visualExperience, /if \(action === 'lyricsOffset'\)/);
  assert.match(visualExperience, /queue\.lyricsOffsetMs/);
});

test('interactive Plex home loading remains independently bounded', () => {
  assert.match(visualPlexClient, /HOME_SECTION_TIMEOUT_MS = 750/);
  assert.match(visualPlexClient, /Promise\.race\(\[lookup, timeout\]\)/);
  assert.match(visualPlexClient, /boundedHomeSection\(\(\) => this\.recentAlbums\(\)/);
  assert.match(visualPlexClient, /boundedHomeSection\(\(\) => this\.favoriteTracks\(\)/);
  assert.match(visualPlexClient, /boundedHomeSection\(\(\) => this\.visualPlaylists\(\)/);
});

test('SAM template refreshes the home snapshot outside Alexa requests', () => {
  assert.match(template, /HomeRefreshFunction:/);
  assert.match(template, /Handler: src\/home-refresh\.handler/);
  assert.match(template, /Schedule: rate\(5 minutes\)/);
  assert.match(template, /QUEUE_TABLE: !Ref QueueTable/);
});

test('APL launch handler is ordered before the general launch handler', () => {
  assert.ok(index.indexOf('VisualLaunchRequestHandler, LaunchRequestHandler') >= 0);
});
