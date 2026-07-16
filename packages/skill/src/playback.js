import { buildSignedStreamUrl } from './signing.js';
import { getTrackAt, tokenFor } from './queue.js';

export function buildAudioItem(queue, position, config, { expectedPreviousToken } = {}) {
  const track = getTrackAt(queue, position);
  if (!track) throw new Error('No track available');

  const stream = {
    token: tokenFor(queue, position),
    url: buildSignedStreamUrl({
      baseUrl: config.gatewayBaseUrl,
      mediaPath: track.streamPath ?? track.partPath,
      secret: config.streamSigningSecret,
      ttlSeconds: config.streamUrlTtlSeconds
    }),
    offsetInMilliseconds: position === queue.index ? queue.offsetMs ?? 0 : 0
  };

  if (expectedPreviousToken) {
    stream.expectedPreviousToken = expectedPreviousToken;
  }

  return {
    stream,
    metadata: {
      title: track.title,
      subtitle: `${track.artist} · ${track.album}`
    }
  };
}

export function playDirective(queue, position, config, behavior = 'REPLACE_ALL', expectedPreviousToken) {
  return {
    type: 'AudioPlayer.Play',
    playBehavior: behavior,
    audioItem: buildAudioItem(queue, position, config, { expectedPreviousToken })
  };
}

export function stopDirective() {
  return { type: 'AudioPlayer.Stop' };
}
