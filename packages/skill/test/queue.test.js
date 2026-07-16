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
  tokenFor
} from '../src/queue.js';

const tracks = [
  { ratingKey: '1', title: 'One' },
  { ratingKey: '2', title: 'Two' },
  { ratingKey: '3', title: 'Three' }
];

test('moves through a queue and handles loop boundaries', () => {
  const queue = createQueue(tracks);
  assert.equal(getTrackAt(queue).title, 'One');
  assert.equal(getNextIndex(queue), 1);
  assert.equal(getPreviousIndex(queue), null);

  moveTo(queue, 2);
  assert.equal(getNextIndex(queue), null);
  queue.loop = true;
  assert.equal(getNextIndex(queue), 0);
});

test('creates parseable queue-scoped tokens', () => {
  const queue = createQueue(tracks);
  const token = tokenFor(queue, 1);
  const parsed = parseToken(token);
  assert.equal(parsed.queueId, queue.queueId);
  assert.equal(parsed.position, 1);
  assert.equal(parsed.ratingKey, '2');
});

test('shuffle keeps the current track active', () => {
  const queue = createQueue(tracks);
  moveTo(queue, 1);
  const current = getTrackAt(queue).ratingKey;
  setShuffle(queue, true);
  assert.equal(getTrackAt(queue).ratingKey, current);
});
