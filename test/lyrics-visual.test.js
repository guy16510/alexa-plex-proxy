import test from 'node:test';
import assert from 'node:assert/strict';
import { lyricWindow, parseWebVtt, shiftWebVtt } from '../src/lyrics.js';

const WEBVTT = `WEBVTT

00:00:01.000 --> 00:00:03.000
First line

00:00:03.000 --> 00:00:05.000
Second line

00:00:05.000 --> 00:00:07.000
Third line
`;

test('parses WebVTT cues for custom karaoke screens', () => {
  const cues = parseWebVtt(WEBVTT);
  assert.equal(cues.length, 3);
  assert.deepEqual(cues[1], { startMs: 3000, endMs: 5000, text: 'Second line' });
});

test('shifts WebVTT captions without producing negative timestamps', () => {
  const later = shiftWebVtt(WEBVTT, 1000);
  assert.match(later, /00:00:02\.000 --> 00:00:04\.000/);
  const earlier = shiftWebVtt(WEBVTT, -5000);
  assert.match(earlier, /00:00:00\.000 --> 00:00:00\.250/);
});

test('selects previous current and next lyric lines from playback position', () => {
  const window = lyricWindow(parseWebVtt(WEBVTT), 3500);
  assert.equal(window.previousLine, 'First line');
  assert.equal(window.currentLine, 'Second line');
  assert.equal(window.nextLine, 'Third line');
});
