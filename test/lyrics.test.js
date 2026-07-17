import test from 'node:test';
import assert from 'node:assert/strict';
import { formatWebVttTimestamp, lrcToWebVtt, parseLrc } from '../src/lyrics.js';

test('parses LRC timestamps, offsets, repeated timestamps, and enhanced timing', () => {
  const cues = parseLrc(`
[offset:+250]
[00:01.00][00:02.50]<00:01.00>Hello <00:01.50>there
[00:03.75]Second line
`);
  assert.deepEqual(cues, [
    { startMs: 1250, text: 'Hello there' },
    { startMs: 2750, text: 'Hello there' },
    { startMs: 4000, text: 'Second line' }
  ]);
});

test('formats valid WebVTT timestamps', () => {
  assert.equal(formatWebVttTimestamp(3_723_004), '01:02:03.004');
});

test('converts LRC to bounded WebVTT cues', () => {
  const webvtt = lrcToWebVtt('[00:00.00]One\n[00:03.00]Two', { durationMs: 5000 });
  assert.match(webvtt, /^WEBVTT/);
  assert.match(webvtt, /00:00:00\.000 --> 00:00:02\.990/);
  assert.match(webvtt, /00:00:03\.000 --> 00:00:05\.000/);
  assert.equal(lrcToWebVtt('[ar:Artist]'), null);
});
