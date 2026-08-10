import { refreshHomeSnapshot } from './home-refresh-service.js';
import { homeSnapshotStore, plex } from './runtime.js';

export async function handler() {
  return refreshHomeSnapshot({
    plex,
    store: homeSnapshotStore
  });
}
