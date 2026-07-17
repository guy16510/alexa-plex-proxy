import { bestMatch, matchScore, normalizeText } from './matching.js';
import { PlexClient } from './plex-client.js';

const MEDIA_TYPES = { artist: 8, album: 9, track: 10 };
const CATALOG_TTL_MS = 10 * 60 * 1000;

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

function identityFor(item) {
  return String(item?.ratingKey ?? item?.key ?? `${item?.title ?? ''}:${item?.type ?? ''}`);
}

function dedupeItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const identity = identityFor(item);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function dedupeTracks(tracks) {
  const seen = new Set();
  return tracks.filter((track) => {
    if (!track?.ratingKey || seen.has(track.ratingKey)) return false;
    seen.add(track.ratingKey);
    return true;
  });
}

function parseSongArtistQuery(query) {
  const match = /^(.+?)\s+by\s+(.+)$/i.exec(String(query ?? '').trim());
  if (!match) return null;
  return { title: match[1].trim(), artist: match[2].trim() };
}

function queryVariants(query) {
  const original = String(query ?? '').trim();
  const normalized = normalizeText(original);
  const noArticle = normalized.replace(/^(the|a|an)\s+/, '');
  const variants = new Set([original, normalized, noArticle]);
  if (normalized.includes('neighbor')) variants.add(normalized.replace(/neighbor/g, 'neighbour'));
  return [...variants].filter(Boolean);
}

function isBlocked(track) {
  return track?.userRating === 0;
}

export class EnhancedPlexClient extends PlexClient {
  constructor(options) {
    super(options);
    this.catalogCache = new Map();
  }

  normalizeTrack(item) {
    const track = super.normalizeTrack(item);
    if (!track) return null;
    const hasRating = item?.userRating !== undefined
      && item?.userRating !== null
      && String(item.userRating).trim() !== '';
    track.userRating = hasRating ? (Number.parseFloat(item.userRating) || 0) : null;
    return track;
  }

  async browseLibrary(kind, limit = kind === 'track' ? 1500 : 5000) {
    const type = MEDIA_TYPES[kind];
    if (!type) throw new Error(`Unsupported Plex media kind: ${kind}`);
    const sectionKey = await this.getMusicSectionKey();
    const container = await this.request(`/library/sections/${sectionKey}/all`, {
      type,
      'X-Plex-Container-Start': 0,
      'X-Plex-Container-Size': limit
    });
    return containerItems(container);
  }

  async catalog(kind) {
    const existing = this.catalogCache.get(kind);
    if (existing && existing.expiresAt > Date.now()) return existing.promise;

    const promise = this.browseLibrary(kind).catch((error) => {
      this.catalogCache.delete(kind);
      throw error;
    });
    this.catalogCache.set(kind, { expiresAt: Date.now() + CATALOG_TTL_MS, promise });
    return promise;
  }

  async searchedCandidates(kind, query, limit = 100) {
    const results = await Promise.all(queryVariants(query).map(async (variant) => {
      try {
        return await super.searchLibrary(kind, variant, limit);
      } catch (error) {
        console.warn('Plex query variant failed', { kind, variant, message: error.message });
        return [];
      }
    }));
    return dedupeItems(results.flat());
  }

  async candidatePool(kind, query) {
    const searched = await this.searchedCandidates(kind, query);
    const preliminary = bestMatch(query, searched, (item) => item?.title ?? '');
    if (preliminary?.score >= 0.72) return searched;

    if (kind === 'artist' || kind === 'album') {
      try {
        return dedupeItems([...searched, ...await this.catalog(kind)]);
      } catch (error) {
        console.warn('Plex broad catalog fallback failed', { kind, message: error.message });
      }
    }
    return searched;
  }

  async matchCatalogItem(kind, query) {
    const candidates = await this.candidatePool(kind, query);
    const matched = bestMatch(query, candidates, (item) => item?.title ?? '');
    return matched && matched.score >= 0.52 ? matched : null;
  }

  filterResult(result) {
    if (!result) return null;
    const tracks = dedupeTracks((result.tracks ?? []).filter((track) => !isBlocked(track)));
    return tracks.length > 0 ? { ...result, tracks } : null;
  }

  async resolveSpecific(kind, query) {
    if (kind === 'track') return this.resolveTrack(query);
    if (kind === 'playlist') return this.filterResult(await super.resolveSpecific(kind, query));

    const matched = await this.matchCatalogItem(kind, query);
    if (!matched) return null;
    const tracks = (await this.tracksFor(kind, matched.candidate))
      .map((item) => this.normalizeTrack(item))
      .filter((track) => track && !isBlocked(track))
      .slice(0, this.maxTracks);
    if (tracks.length === 0) return null;

    return {
      kind,
      title: String(matched.candidate.title || query).slice(0, 250),
      score: matched.score,
      tracks
    };
  }

  async resolveTrack(query) {
    const split = parseSongArtistQuery(query);
    const rawCandidates = [];

    for (const searchQuery of new Set([query, split?.title].filter(Boolean))) {
      rawCandidates.push(...await this.searchedCandidates('track', searchQuery));
    }

    if (split) {
      const artistMatch = await this.matchCatalogItem('artist', split.artist);
      if (artistMatch) {
        try {
          rawCandidates.push(...await this.tracksFor('artist', artistMatch.candidate));
        } catch (error) {
          console.warn('Artist track fallback failed', { artist: split.artist, message: error.message });
        }
      }
    }

    let candidates = dedupeTracks(
      rawCandidates.map((item) => this.normalizeTrack(item)).filter((track) => track && !isBlocked(track))
    );

    const preliminary = bestMatch(split?.title ?? query, candidates, (track) => track.title);
    if (candidates.length === 0 || (preliminary?.score ?? 0) < 0.58) {
      try {
        const broadTracks = (await this.catalog('track'))
          .map((item) => this.normalizeTrack(item))
          .filter((track) => track && !isBlocked(track));
        candidates = dedupeTracks([...candidates, ...broadTracks]);
      } catch (error) {
        console.warn('Plex broad track fallback failed', { message: error.message });
      }
    }

    let best = null;
    for (const candidate of candidates) {
      const directScore = Math.max(
        matchScore(query, candidate.title),
        matchScore(query, `${candidate.title} ${candidate.artist}`)
      );
      const compositeScore = split
        ? (matchScore(split.title, candidate.title) * 0.7)
          + (matchScore(split.artist, candidate.artist) * 0.3)
        : 0;
      const score = Math.max(directScore, compositeScore);
      if (!best || score > best.score) best = { candidate, score };
    }

    if (!best || best.score < 0.5) return null;
    return {
      kind: 'track',
      title: `${best.candidate.title} by ${best.candidate.artist}`.slice(0, 250),
      score: best.score,
      tracks: [best.candidate]
    };
  }

  async resolveGenre(query) {
    return this.filterResult(await super.resolveGenre(query));
  }

  async resolveDecade(query) {
    return this.filterResult(await super.resolveDecade(query));
  }

  async radioForTrack(track) {
    return this.filterResult(await super.radioForTrack(track));
  }
}
