import { XMLParser } from 'fast-xml-parser';
import { bestMatch } from './matching.js';

const MEDIA_TYPES = {
  artist: 8,
  album: 9,
  track: 10
};

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function pickContainerItems(container) {
  return [
    ...asArray(container?.Directory),
    ...asArray(container?.Track),
    ...asArray(container?.Playlist)
  ];
}

function getFirstPart(item) {
  for (const media of asArray(item?.Media)) {
    const part = asArray(media?.Part)[0];
    if (part?.key) {
      return { media, part };
    }
  }
  return null;
}

export class PlexClient {
  constructor({ baseUrl, token, musicLibrary = 'Music', fetchImpl = fetch, maxTracks = 150 }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.musicLibrary = musicLibrary;
    this.fetchImpl = fetchImpl;
    this.maxTracks = maxTracks;
    this.musicSectionKey = null;
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: false,
      trimValues: true
    });
  }

  async request(path, searchParams = {}) {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await this.fetchImpl(url, {
      headers: {
        Accept: 'application/xml',
        'X-Plex-Token': this.token,
        'X-Plex-Product': 'Alexa Plex Proxy',
        'X-Plex-Version': '0.1.0',
        'X-Plex-Client-Identifier': 'alexa-plex-proxy-gateway'
      },
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Plex request failed: ${response.status} ${body.slice(0, 200)}`);
    }

    const xml = await response.text();
    return this.parser.parse(xml)?.MediaContainer ?? {};
  }

  async getMusicSectionKey() {
    if (this.musicSectionKey) return this.musicSectionKey;

    const container = await this.request('/library/sections');
    const sections = asArray(container.Directory);
    const section = sections.find(
      (item) => item.type === 'artist' && item.title?.toLowerCase() === this.musicLibrary.toLowerCase()
    ) ?? sections.find((item) => item.type === 'artist');

    if (!section?.key) {
      throw new Error(`No Plex music library found. Expected '${this.musicLibrary}'.`);
    }

    this.musicSectionKey = String(section.key);
    return this.musicSectionKey;
  }

  async healthCheck() {
    const container = await this.request('/identity');
    return {
      machineIdentifier: container.machineIdentifier,
      version: container.version
    };
  }

  async searchLibrary(kind, query, limit = 50) {
    const sectionKey = await this.getMusicSectionKey();
    const type = MEDIA_TYPES[kind];
    if (!type) throw new Error(`Unsupported Plex media kind: ${kind}`);

    const container = await this.request(`/library/sections/${sectionKey}/all`, {
      type,
      title: query,
      'X-Plex-Container-Start': 0,
      'X-Plex-Container-Size': limit
    });

    return pickContainerItems(container);
  }

  async searchPlaylists() {
    const container = await this.request('/playlists', {
      playlistType: 'audio',
      'X-Plex-Container-Start': 0,
      'X-Plex-Container-Size': 500
    });
    return pickContainerItems(container);
  }

  async getTracksForItem(kind, item) {
    if (kind === 'track') return [item];

    if (kind === 'artist') {
      const container = await this.request(`/library/metadata/${item.ratingKey}/allLeaves`, {
        'X-Plex-Container-Start': 0,
        'X-Plex-Container-Size': this.maxTracks
      });
      return pickContainerItems(container);
    }

    if (kind === 'album') {
      const container = await this.request(`/library/metadata/${item.ratingKey}/children`, {
        'X-Plex-Container-Start': 0,
        'X-Plex-Container-Size': this.maxTracks
      });
      return pickContainerItems(container);
    }

    if (kind === 'playlist') {
      const container = await this.request(`/playlists/${item.ratingKey}/items`, {
        'X-Plex-Container-Start': 0,
        'X-Plex-Container-Size': this.maxTracks
      });
      return pickContainerItems(container);
    }

    throw new Error(`Unsupported Plex media kind: ${kind}`);
  }

  normalizeTrack(item) {
    const selected = getFirstPart(item);
    if (!selected) return null;

    const { media, part } = selected;
    const durationMs = Number.parseInt(item.duration ?? part.duration ?? media.duration ?? '0', 10) || 0;

    return {
      ratingKey: String(item.ratingKey ?? item.key ?? part.key),
      title: item.title || 'Unknown track',
      artist: item.grandparentTitle || item.originalTitle || item.artist || 'Unknown artist',
      album: item.parentTitle || item.album || 'Unknown album',
      durationMs,
      partPath: part.key,
      container: part.container || media.container || null,
      audioCodec: media.audioCodec || null
    };
  }

  async resolveSpecific(kind, query) {
    const candidates = kind === 'playlist'
      ? await this.searchPlaylists()
      : await this.searchLibrary(kind, query);

    const matched = bestMatch(query, candidates, (item) => item.title ?? '');
    if (!matched || matched.score < 0.42) return null;

    const rawTracks = await this.getTracksForItem(kind, matched.candidate);
    const tracks = rawTracks
      .map((item) => this.normalizeTrack(item))
      .filter(Boolean)
      .slice(0, this.maxTracks);

    if (tracks.length === 0) return null;

    return {
      kind,
      title: matched.candidate.title || query,
      score: matched.score,
      tracks
    };
  }

  async resolve(kind, query) {
    const cleanQuery = String(query ?? '').trim();
    if (!cleanQuery) throw new Error('A search query is required');

    if (kind !== 'any') {
      return this.resolveSpecific(kind, cleanQuery);
    }

    const priorities = { track: 0.035, artist: 0.025, album: 0.015, playlist: 0 };
    const results = await Promise.all(
      ['track', 'artist', 'album', 'playlist'].map(async (candidateKind) => {
        try {
          return await this.resolveSpecific(candidateKind, cleanQuery);
        } catch (error) {
          console.warn(`Plex ${candidateKind} search failed`, error);
          return null;
        }
      })
    );

    return results
      .filter(Boolean)
      .sort(
        (left, right) =>
          right.score + priorities[right.kind] - (left.score + priorities[left.kind])
      )[0] ?? null;
  }
}
