const DEFAULT_REFRESH_SECTION_TIMEOUT_MS = 5000;

async function boundedSection(load, label, timeoutMs, logger) {
  const startedAt = Date.now();
  let timer;
  try {
    const lookup = Promise.resolve()
      .then(load)
      .then((value) => ({ status: 'ok', value: Array.isArray(value) ? value : [] }))
      .catch((error) => ({ status: 'error', value: [], error }));
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ status: 'timeout', value: [] }), timeoutMs);
    });
    const result = await Promise.race([lookup, timeout]);
    if (result.status !== 'ok') {
      logger.warn('Home snapshot refresh section unavailable', {
        section: label,
        status: result.status,
        elapsedMs: Date.now() - startedAt,
        message: result.error?.message || null
      });
    }
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function refreshHomeSnapshot({
  plex,
  store,
  timeoutMs = DEFAULT_REFRESH_SECTION_TIMEOUT_MS,
  logger = console
}) {
  const startedAt = Date.now();
  const [recentAlbums, favorites, playlists] = await Promise.all([
    boundedSection(() => plex.recentAlbums(), 'recentAlbums', timeoutMs, logger),
    boundedSection(() => plex.favoriteTracks(), 'favorites', timeoutMs, logger),
    boundedSection(() => plex.visualPlaylists(), 'playlists', timeoutMs, logger)
  ]);

  const results = [recentAlbums, favorites, playlists];
  if (results.every((result) => result.status !== 'ok')) {
    logger.warn('Home snapshot refresh preserved last-known-good snapshot', {
      elapsedMs: Date.now() - startedAt,
      outcomes: results.map((result) => result.status)
    });
    return {
      updated: false,
      reason: 'all-sections-unavailable',
      outcomes: results.map((result) => result.status),
      elapsedMs: Date.now() - startedAt
    };
  }

  const content = {
    recentAlbums: recentAlbums.value,
    favorites: favorites.value,
    playlists: playlists.value,
    backgroundImage: recentAlbums.value[0]?.artUrl
      || favorites.value[0]?.artUrl
      || playlists.value[0]?.artUrl
      || ''
  };
  const saved = await store.put(content);
  logger.info('Home snapshot refreshed', {
    elapsedMs: Date.now() - startedAt,
    updatedAt: saved.updatedAt,
    recentAlbums: content.recentAlbums.length,
    favorites: content.favorites.length,
    playlists: content.playlists.length,
    outcomes: results.map((result) => result.status)
  });
  return {
    updated: true,
    updatedAt: saved.updatedAt,
    outcomes: results.map((result) => result.status),
    elapsedMs: Date.now() - startedAt
  };
}
