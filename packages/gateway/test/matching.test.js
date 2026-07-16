import test from 'node:test';
import assert from 'node:assert/strict';
import { bestMatch, normalizeSearchText, scoreMatch } from '../src/matching.js';

test('normalizes punctuation and accents', () => {
  assert.equal(normalizeSearchText('Beyoncé & JAY-Z'), 'beyonce and jay z');
});

test('scores exact and partial matches ahead of unrelated values', () => {
  assert.equal(scoreMatch('Queen', 'Queen'), 1);
  assert.ok(scoreMatch('dark side moon', 'The Dark Side of the Moon') > 0.6);
  assert.ok(scoreMatch('Queen', 'Queen') > scoreMatch('Queen', 'Queens of the Stone Age'));
});

test('selects the best candidate', () => {
  const match = bestMatch('the wall', [
    { title: 'Wish You Were Here' },
    { title: 'The Wall' },
    { title: 'Animals' }
  ]);
  assert.equal(match.candidate.title, 'The Wall');
});
