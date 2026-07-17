import { matchScore } from './matching.js';
import { EnhancedPlexClient } from './enhanced-plex-client.js';

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function containerItems(container) {
  return [
    ...asArray(container?.Directory),
    ...asArray(container?.Track),
    ...asArray(container?.Playlist),
    ...asArray(container?.Metadata)
  ];
}

function dedupe(items, getKey = (item) => item?.ratingKey ?? item?.title) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(getKey(item) ?? '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizedKind(kind) {
  return ['artist', 'album', 'track', 'playlist'].includes(kind) ? kind : 'any';
}

export class VisualPlexClient extends EnhancedPlexClient {
  imageSourcesFor(item, { background = false } = {}) {
    if (!item) return [];
    const trackLike = {
      thumbPath: item.thumbPath || item.thumb || item.parentThumb || item.grandparentThumb || null,
      artPath: item.artPath || item.art || item.parentArt || item.grandparentArt || null
    };
    return this.buildArtworkSources(trackLike, { background });
  }

  visualItem(item, kind = item?.kind || item?.type || 'any') {
    if (!item) return null;
    const normalized = item.partPath ? item : null;
    const actualKind = normalizedKind(kind);
    const title = String(item.title || item.name || 'Unknown').slice(0, 150);
    const subtitle = normalized
      ? [normalized.artist, normalized.album].filter(Boolean).join(' • ')
      : String(
        item.grandparentTitle
        || item.parentTitle
        || item.originalTitle
        || (actualKind === 'playlist' ? 'Plex playlist' : actualKind)
        || ''
      ).slice(0, 150);
    const imageUrl = this.imageSourcesFor(item)[0]?.url || '';
    const artUrl = this.imageSourcesFor(item, { background: true })[0]?.url || imageUrl;
    return {
      kind: actualKind,
      query: title,
      ratingKey: item.ratingKey ? String(item.ratingKey) : null,
      title,
      subtitle,
      imageUrl,
      artUrl
    };
  }

  async recentAlbums(limit = 12) {
    const sectionKey = await this.getMusicSectionKey();
    const container = await this.request(`/library/sections/${sectionKey}/recentlyAdded`, {
      type: 9,
      'X-Plex-Container-Start': 0,
      'X-Plex-Container-Size': limit
    });
    return dedupe(containerItems(container))
      .slice(0, limit)
      .map((item) => this.visualItem(item, 'album'))
      .filter(Boolean);
  }

  async favoriteTracks(limit = 12) {
    const tracks = (await this.catalog('track'))
      .map((item) => this.normalizeTrack(item))
      .filter((track) => track && Number(track.userRating) >= 8)
      .sort((left, right) => (Number(right.userRating) || 0) - (Number(left.userRating) || 0));
    return dedupe(tracks)
      .slice(0, limit)
      .map((track) => this.visualItem(track, 'track'))
      .filter(Boolean);
  }

  async visualPlaylists(limit = 12) {
    const playlists = await this.searchPlaylists();
    return dedupe(playlists)
      .slice(0, limit)
      .map((item) => this.visualItem(item, 'playlist'))
      .filter(Boolean);
  }

  async homeContent() {
    const [recentAlbums, favorites, playlists] = await Promise.allSettled([
      this.recentAlbums(),
      this.favoriteTracks(),
      this.visualPlaylists()
    ]);
    const valueOrEmpty = (result) => result.status === 'fulfilled' ? result.value : [];
    const content = {
      recentAlbums: valueOrEmpty(recentAlbums),
      favorites: valueOrEmpty(favorites),
      playlists: valueOrEmpty(playlists)
    };
    content.backgroundImage = content.recentAlbums[0]?.artUrl
      || content.favorites[0]?.artUrl
      || content.playlists[0]?.artUrl
      || '';
    return content;
  }

  async rankedCandidates(kind, query, limit = 3) {
    const actualKind = normalizedKind(kind);
    let raw = [];

    if (actualKind === 'artist' || actualKind === 'album') {
      raw = await this.candidatePool(actualKind, query);
    } else if (actualKind === 'playlist') {
      raw = await this.searchPlaylists();
    } else if (actualKind === 'track') {
      raw = await this.searchedCandidates('track', query);
      let normalized = raw.map((item) => this.normalizeTrack(item)).filter(Boolean);
      const strongest = normalized
        .map((track) => matchScore(query, `${track.title} ${track.artist}`))
        .sort((a, b) => b - a)[0] ?? 0;
      if (strongest < 0.68) {
        try {
          normalized = dedupe([
            ...normalized,
            ...(await this.catalog('track')).map((item) => this.normalizeTrack(item)).filter(Boolean)
          ]);
        } catch (error) {
          console.warn('Visual track alternatives fallback failed', { message: error.message });
        }
      }
      return normalized
        .map((track) => ({
          item: track,
          score: Math.max(
            matchScore(query, track.title),
            matchScore(query, `${track.title} ${track.artist}`)
          )
        }))
        .filter(({ score }) => score >= 0.38)
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);
    } else {
      return [];
    }

    return dedupe(raw)
      .map((item) => ({ item, score: matchScore(query, item?.title ?? '') }))
      .filter(({ score }) => score >= 0.38)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  async decorateResult(result, kind, query) {
    if (!result) return null;
    const actualKind = normalizedKind(result.kind === 'radio' ? kind : result.kind);
    if (actualKind === 'any' || result.score >= 0.86) {
      return { ...result, needsConfirmation: false, alternatives: [] };
    }

    let ranked = [];
    try {
      ranked = await this.rankedCandidates(actualKind, query, 3);
    } catch (error) {
      console.warn('Visual alternatives lookup failed', {
        kind: actualKind,
        query,
        message: error.message
      });
    }
    if (ranked.length === 0) {
      return { ...result, needsConfirmation: false, alternatives: [] };
    }

    const top = ranked[0];
    const second = ranked[1];
    const margin = second ? top.score - second.score : 1;
    const credible = ranked.filter(({ score }) => score >= Math.max(0.46, top.score - 0.22));
    const needsConfirmation = top.score < 0.78 && credible.length > 1 && margin < 0.16;
    const alternatives = credible.map(({ item, score }) => ({
      ...this.visualItem(item, actualKind),
      score: Number(score.toFixed(3))
    }));

    return {
      ...result,
      confidence: Number(top.score.toFixed(3)),
      confidenceMargin: Number(margin.toFixed(3)),
      needsConfirmation,
      alternatives
    };
  }

  async resolveSpecific(kind, query) {
    if (kind === 'track') return this.resolveTrack(query);
    const result = await super.resolveSpecific(kind, query);
    return this.decorateResult(result, kind, query);
  }

  async resolveTrack(query) {
    const result = await super.resolveTrack(query);
    return this.decorateResult(result, 'track', query);
  }
}
