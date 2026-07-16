import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQueue,
  getNextIndex,
  getPreviousIndex,
  getTrackAt,
  moveTo,
  parseToken,
  setShuffle,
  tokenFor,
  tokenMatchesQueue
} from '../src/queue.js';

const tracks = [
  { ratingKey: '1', title: 'One' },
  { ratingKey: '2', title: 'Two' },
  { ratingKey: '3', title: 'Three' }
];

test('queue moves next and previous without wrapping by default', () => {
  const queue = createQueue(tracks);
  assert.equal(getNextIndex(queue), 1);
  assert.equal(getPreviousIndex(queue), null);
  moveTo(queue, 2);
  assert.equal(getNextIndex(queue), null);
  assert.equal(getPreviousIndex(queue), 1);
});

test('loop wraps the queue', () => {
  const queue = createQueue(tracks);
  queue.loop = true;
  moveTo(queue, 2);
  assert.equal(getNextIndex(queue), 0);
  moveTo(queue, 0);
  assert.equal(getPreviousIndex(queue), 2);
});

test('shuffle preserves current track and invalidates old tokens', () => {
  const queue = createQueue(tracks);
  moveTo(queue, 1);
  const oldToken = tokenFor(queue, 1);
  setShuffle(queue, true, () => 0);
  assert.equal(getTrackAt(queue).ratingKey, '2');
  assert.equal(queue.index, 0);
  assert.equal(tokenMatchesQueue(queue, oldToken), false);
});

test('tokens bind queue, generation, position, and track', () => {
  const queue = createQueue(tracks);
  const token = tokenFor(queue, 0);
  const parsed = parseToken(token);
  assert.equal(parsed.position, 0);
  assert.equal(parsed.ratingKey, '1');
  assert.equal(tokenMatchesQueue(queue, token), true);
  assert.equal(tokenMatchesQueue(queue, token.replace(/:1$/, ':9')), false);
});
