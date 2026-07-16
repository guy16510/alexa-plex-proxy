import { randomUUID } from 'node:crypto';

function shuffled(values, random = Math.random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createQueue(tracks, { sourceTitle = '', sourceKind = 'any', ttlHours = 24 } = {}) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error('Cannot create an empty queue');
  }

  const now = Date.now();
  return {
    id: randomUUID(),
    generation: 0,
    tracks,
    order: tracks.map((_, index) => index),
    index: 0,
    offsetMs: 0,
    shuffle: false,
    loop: false,
    enqueuedIndex: null,
    retryCounts: {},
    sourceTitle,
    sourceKind,
    createdAt: now,
    updatedAt: now,
    expiresAt: Math.floor(now / 1000) + (ttlHours * 3600)
  };
}

export function getTrackAt(queue, position = queue.index) {
  const trackIndex = queue.order?.[position];
  if (!Number.isInteger(trackIndex)) return null;
  return queue.tracks?.[trackIndex] ?? null;
}

export function getNextIndex(queue, fromPosition = queue.index) {
  if (!queue.order?.length) return null;
  if (fromPosition < queue.order.length - 1) return fromPosition + 1;
  return queue.loop ? 0 : null;
}

export function getPreviousIndex(queue, fromPosition = queue.index) {
  if (!queue.order?.length) return null;
  if (fromPosition > 0) return fromPosition - 1;
  return queue.loop ? queue.order.length - 1 : null;
}

export function moveTo(queue, position) {
  if (!Number.isInteger(position) || position < 0 || position >= queue.order.length) {
    return false;
  }
  queue.index = position;
  queue.offsetMs = 0;
  queue.enqueuedIndex = null;
  queue.updatedAt = Date.now();
  return true;
}

export function setShuffle(queue, enabled, random = Math.random) {
  const currentTrackIndex = queue.order[queue.index];
  const naturalOrder = queue.tracks.map((_, index) => index);

  if (enabled) {
    const remaining = naturalOrder.filter((index) => index !== currentTrackIndex);
    queue.order = [currentTrackIndex, ...shuffled(remaining, random)];
    queue.index = 0;
  } else {
    queue.order = naturalOrder;
    queue.index = Math.max(0, naturalOrder.indexOf(currentTrackIndex));
  }

  queue.shuffle = enabled;
  queue.generation += 1;
  queue.offsetMs = 0;
  queue.enqueuedIndex = null;
  queue.retryCounts = {};
  queue.updatedAt = Date.now();
  return queue;
}

export function tokenFor(queue, position) {
  const track = getTrackAt(queue, position);
  if (!track) throw new Error(`No track at queue position ${position}`);
  return `q:${queue.id}:${queue.generation}:${position}:${track.ratingKey}`;
}

export function parseToken(token) {
  const match = /^q:([0-9a-f-]+):(\d+):(\d+):([^:]+)$/i.exec(String(token ?? ''));
  if (!match) return null;
  return {
    queueId: match[1],
    generation: Number.parseInt(match[2], 10),
    position: Number.parseInt(match[3], 10),
    ratingKey: match[4]
  };
}

export function tokenMatchesQueue(queue, token) {
  const parsed = parseToken(token);
  if (!parsed) return false;
  const track = getTrackAt(queue, parsed.position);
  return parsed.queueId === queue.id
    && parsed.generation === queue.generation
    && track?.ratingKey === parsed.ratingKey;
}
