import test from 'node:test';
import assert from 'node:assert/strict';
import { createResponder } from '../src/personality.js';

test('clean mode returns interpolated family-safe responses', () => {
  const respond = createResponder({ mode: 'clean', random: () => 0 });
  assert.equal(respond('playing', { title: 'The Wall' }), 'Playing The Wall.');
});

test('spicy mode is short, vulgar, and interpolates details', () => {
  const respond = createResponder({ mode: 'spicy', random: () => 0 });
  assert.equal(respond('notFound', { query: 'Benson Boone' }), 'Oh shit, where did I put Benson Boone?');
  const response = respond('nowPlaying', {
    title: 'Everlong',
    artist: 'Foo Fighters',
    album: 'The Colour and the Shape'
  });
  assert.match(response, /Everlong/);
  assert.match(response, /Foo Fighters/);
  assert.ok(response.length < 120);
});
