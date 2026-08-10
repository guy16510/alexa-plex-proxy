import { DEFAULT_HOME_SNAPSHOT_READ_TIMEOUT_MS } from './home-snapshot-store.js';

const EMPTY_LIST = Object.freeze([]);
export const EMPTY_HOME_CONTENT = Object.freeze({
  recentAlbums: EMPTY_LIST,
  favorites: EMPTY_LIST,
  playlists: EMPTY_LIST,
  backgroundImage: ''
});

export async function loadLaunchHome(snapshotStore, {
  timeoutMs = DEFAULT_HOME_SNAPSHOT_READ_TIMEOUT_MS
} = {}) {
  const startedAt = Date.now();
  try {
    const result = await snapshotStore.get({ timeoutMs });
    if (result?.status === 'hit' && result.content) {
      return {
        content: result.content,
        source: 'snapshot',
        reason: 'hit',
        snapshotUpdatedAt: result.updatedAt ?? null,
        elapsedMs: Date.now() - startedAt
      };
    }
    return {
      content: EMPTY_HOME_CONTENT,
      source: 'fallback',
      reason: result?.status || 'unknown',
      snapshotUpdatedAt: null,
      elapsedMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      content: EMPTY_HOME_CONTENT,
      source: 'fallback',
      reason: 'exception',
      snapshotUpdatedAt: null,
      elapsedMs: Date.now() - startedAt,
      error
    };
  }
}
