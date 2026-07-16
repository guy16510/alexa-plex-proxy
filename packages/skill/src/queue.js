import { randomUUID } from 'node:crypto';

export function createQueue(tracks, { shuffle = false } = {}) {
  const order = tracks.map((_, index) => index);
  if (shuffle) shuffleOrder(order, 0);

  return {
    queueId: randomUUID(),
    tracks,
    order,
    index: 0,
    offsetMs: 0,
    shuffle,
    loop: false,
    enqueuedIndex: null,
    updatedAt: new Date().toISOString()
  };
}

function shuffleOrder(order, currentIndex) {
  const currentTrackIndex = order[currentIndex];
  const remaining = order.filter((_, index) => index !== currentIndex);
  for (let i = remaining.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  order.splice(0, order.length, currentTrackIndex, ...remaining);
}

export function setShuffle(queue, enabled) {
  const currentTrackIndex = queue.order[queue.index];
  if (enabled) {
    const remaining = queue.order.filter((_, index) => index !== queue.index);
    for (let i = remaining.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    queue.order = [currentTrackIndex, ...remaining];
    queue.index = 0;
  } else {
    queue.order = queue.tracks.map((_, index) => index);
    queue.index = currentTrackIndex;
  }
  queue.shuffle = enabled;
  queue.enqueuedIndex = null;
  queue.updatedAt = new Date().toISOString();
  return queue;
}

export function getTrackAt(queue, position = queue.index) {
  const trackIndex = queue.order[position];
  return Number.isInteger(trackIndex) ? queue.tracks[trackIndex] ?? null : null;
}

export function getNextIndex(queue, fromIndex = queue.index) {
  if (queue.order.length === 0) return null;
  const next = fromIndex + 1;
  if (next < queue.order.length) return next;
  return queue.loop ? 0 : null;
}

export function getPreviousIndex(queue, fromIndex = queue.index) {
  if (queue.order.length === 0) return null;
  const previous = fromIndex - 1;
  if (previous >= 0) return previous;
  return queue.loop ? queue.order.length - 1 : null;
}

export function moveTo(queue, index) {
  if (!Number.isInteger(index) || index < 0 || index >= queue.order.length) {
    return false;
  }
  queue.index = index;
  queue.offsetMs = 0;
  queue.enqueuedIndex = null;
  queue.updatedAt = new Date().toISOString();
  return true;
}

export function tokenFor(queue, position) {
  const track = getTrackAt(queue, position);
  if (!track) throw new Error('No track at queue position');
  return `${queue.queueId}:${position}:${track.ratingKey}`;
}

export function parseToken(token) {
  if (typeof token !== 'string') return null;
  const [queueId, position, ...ratingKeyParts] = token.split(':');
  const parsedPosition = Number.parseInt(position, 10);
  if (!queueId || !Number.isInteger(parsedPosition) || ratingKeyParts.length === 0) return null;
  return {
    queueId,
    position: parsedPosition,
    ratingKey: ratingKeyParts.join(':')
  };
}
