import { getTrackAt, tokenFor } from './queue.js';

export function playDirective({
  queue,
  position,
  plex,
  behavior = 'REPLACE_ALL',
  expectedPreviousToken = undefined,
  offsetMs = undefined
}) {
  const track = getTrackAt(queue, position);
  if (!track) throw new Error(`No track at queue position ${position}`);

  const token = tokenFor(queue, position);
  const sessionId = `${queue.id}-${queue.generation}-${position}-${Date.now().toString(36)}`;
  const stream = {
    token,
    url: plex.buildAudioUrl(track, sessionId),
    offsetInMilliseconds: offsetMs ?? (position === queue.index ? queue.offsetMs : 0)
  };

  if (behavior === 'ENQUEUE') {
    stream.expectedPreviousToken = expectedPreviousToken;
  }

  const metadata = {
    title: track.title,
    subtitle: track.artist
  };
  const artUrl = plex.buildArtworkUrl(track);
  if (artUrl) {
    metadata.art = {
      contentDescription: track.album,
      sources: [{ url: artUrl }]
    };
  }

  return {
    type: 'AudioPlayer.Play',
    playBehavior: behavior,
    audioItem: {
      stream,
      metadata
    }
  };
}

export function stopDirective() {
  return { type: 'AudioPlayer.Stop' };
}
