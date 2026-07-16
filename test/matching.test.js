import test from 'node:test';
import assert from 'node:assert/strict';
import { bestMatch, matchScore, normalizeText } from '../src/matching.js';

test('normalizes punctuation, accents, ampersands, and whitespace', () => {
  assert.equal(normalizeText('  Beyoncé & JAY-Z! '), "beyonce and jay z");
});

test('exact and article-insensitive matches rank highest', () => {
  assert.equal(matchScore('The Wall', 'The Wall'), 1);
  assert.ok(matchScore('Wall', 'The Wall') >= 0.98);
});

test('bestMatch selects the closest candidate', () => {
  const result = bestMatch('bohemian rapsody', [
    { title: 'Radio Ga Ga' },
    { title: 'Bohemian Rhapsody' },
    { title: 'Under Pressure' }
  ]);
  assert.equal(result.candidate.title, 'Bohemian Rhapsody');
  assert.ok(result.score > 0.7);
});
