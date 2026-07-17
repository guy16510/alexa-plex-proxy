import { loadConfig } from './config.js';
import { EnhancedPlexClient } from './enhanced-plex-client.js';
import { createResponder } from './personality.js';
import { QueueStore } from './queue-store.js';

export const config = loadConfig();
export const respond = createResponder({ mode: config.personalityMode });
export const plex = new EnhancedPlexClient({
  baseUrl: config.plexUrl,
  token: config.plexToken,
  streamBaseUrl: config.streamBaseUrl,
  musicLibrary: config.plexMusicLibrary,
  maxTracks: config.maxQueueTracks,
  maxAudioBitrate: config.maxAudioBitrate,
  transcodePolicy: config.transcodePolicy,
  requestTimeoutMs: config.plexRequestTimeoutMs,
  lyricsMode: config.lyricsMode,
  lyricsRequestTimeoutMs: config.lyricsRequestTimeoutMs,
  radioTrackLimit: config.radioTrackLimit,
  allowPlaylistWrites: config.allowPlaylistWrites
});
export const queueStore = new QueueStore({ tableName: config.queueTable });
