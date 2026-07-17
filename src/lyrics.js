const LRC_TIMESTAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const ENHANCED_TIMESTAMP = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;

function fractionToMilliseconds(value = '') {
  if (!value) return 0;
  if (value.length === 1) return Number(value) * 100;
  if (value.length === 2) return Number(value) * 10;
  return Number(value.slice(0, 3));
}

function timestampToMilliseconds(minutes, seconds, fraction) {
  return (Number(minutes) * 60_000) + (Number(seconds) * 1000) + fractionToMilliseconds(fraction);
}

function sanitizeCueText(value) {
  return String(value ?? '')
    .replace(ENHANCED_TIMESTAMP, '')
    .replace(/-->/g, '→')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
}

export function parseLrc(value) {
  const text = String(value ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let globalOffsetMs = 0;
  const cues = [];

  for (const rawLine of text.split('\n')) {
    const offsetMatch = /^\s*\[offset:([+-]?\d+)\]\s*$/i.exec(rawLine);
    if (offsetMatch) {
      globalOffsetMs = Number.parseInt(offsetMatch[1], 10) || 0;
      continue;
    }

    const timestamps = [...rawLine.matchAll(LRC_TIMESTAMP)];
    if (timestamps.length === 0) continue;
    const cueText = sanitizeCueText(rawLine.replace(LRC_TIMESTAMP, ''));
    if (!cueText) continue;

    for (const match of timestamps) {
      cues.push({
        startMs: Math.max(0, timestampToMilliseconds(match[1], match[2], match[3]) + globalOffsetMs),
        text: cueText
      });
    }
  }

  return cues
    .sort((left, right) => left.startMs - right.startMs)
    .filter((cue, index, values) => index === 0
      || cue.startMs !== values[index - 1].startMs
      || cue.text !== values[index - 1].text);
}

export function formatWebVttTimestamp(milliseconds) {
  const total = Math.max(0, Math.floor(Number(milliseconds) || 0));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function lrcToWebVtt(value, { durationMs = 0, maxChars = 50_000 } = {}) {
  const cues = parseLrc(value);
  if (cues.length === 0) return null;

  const output = ['WEBVTT', ''];
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    if (durationMs > 0 && cue.startMs >= durationMs) continue;
    const next = cues[index + 1];
    const naturalEnd = next ? Math.max(cue.startMs + 500, next.startMs - 10) : cue.startMs + 5000;
    const endMs = durationMs > 0
      ? Math.max(cue.startMs + 500, Math.min(durationMs, naturalEnd))
      : naturalEnd;
    const block = `${formatWebVttTimestamp(cue.startMs)} --> ${formatWebVttTimestamp(endMs)}\n${cue.text}\n`;
    if (output.join('\n').length + block.length + 1 > maxChars) break;
    output.push(block);
  }

  return output.length > 2 ? `${output.join('\n')}\n` : null;
}
