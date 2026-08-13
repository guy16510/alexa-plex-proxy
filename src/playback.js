import { shiftWebVtt } from './lyrics.js';
import { getTrackAt, tokenFor } from './queue.js';

export async function playDirective({
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

  try {
    // Use cached/immediately available captions, but never wait on a network lookup.
    const cached = plex.peekTimedLyrics?.(track) ?? null;
    const captions = cached ?? (plex.getTimedLyrics
      ? await Promise.race([Promise.resolve(plex.getTimedLyrics(track)), Promise.resolve(null)])
      : null);
    if (captions) {
      stream.captionData = {
        type: 'WEBVTT',
        content: shiftWebVtt(captions, queue.lyricsOffsetMs ?? 0)
      };
    }
  } catch (error) {
    console.warn('Lyrics lookup failed; continuing without captions', {
      ratingKey: track.ratingKey,
      message: error.message
    });
  }

  const artSources = plex.buildArtworkSources(track, { background: false });
  const backgroundSources = plex.buildArtworkSources(track, { background: true });
  const metadata = {
    title: track.title,
    subtitle: [track.artist, track.album].filter(Boolean).join(' • '),
    art: { sources: artSources },
    backgroundImage: { sources: backgroundSources }
  };

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
