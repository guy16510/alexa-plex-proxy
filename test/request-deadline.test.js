import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RequestDeadline,
  RequestDeadlineExceededError,
  currentRequestDeadline,
  runWithRequestDeadline
} from '../src/request-deadline.js';

test('caps dependency timeouts to the remaining request budget', () => {
  let now = 100;
  const deadline = new RequestDeadline({ budgetMs: 6500, now: () => now });
  assert.equal(deadline.timeoutMs(1800), 1800);
  now = 6400;
  assert.equal(deadline.timeoutMs(1800), 200);
  now = 6600;
  assert.throws(() => deadline.timeoutMs(1800), RequestDeadlineExceededError);
});

test('keeps concurrent request deadlines isolated in async work', async () => {
  const first = new RequestDeadline({ budgetMs: 1000, now: () => 0 });
  const second = new RequestDeadline({ budgetMs: 2000, now: () => 0 });

  const values = await Promise.all([
    runWithRequestDeadline(first, async () => {
      await Promise.resolve();
      return currentRequestDeadline().remainingMs();
    }),
    runWithRequestDeadline(second, async () => {
      await Promise.resolve();
      return currentRequestDeadline().remainingMs();
    })
  ]);

  assert.deepEqual(values, [1000, 2000]);
});
