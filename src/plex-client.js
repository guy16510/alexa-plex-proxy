import { randomUUID } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { bestMatch } from './matching.js';

const MEDIA_TYPES = {
  artist: 8,
  album: 9,
  track: 10
};
const DIRECT_CONTAINERS = new Set(['mp3', 'aac', 'm4a', 'mp4']);
const DIRECT_CODECS = new Set(['mp3', 'aac']);

export function redactPlexSecrets(value) {
  return String(value ?? '')
    .replace(/([?&]X-Plex-Token=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/(X-Plex-Token:\s*)[^\s,}]+/gi, '$1[REDACTED]');
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function containerItems(container) {
  return [
    ...asArray(container?.Directory),
    ...asArray(container?.Track),
    ...asArray(container?.Playlist)
  ];
}

function firstPart(item) {
  for (const media of asArray(item?.Media)) {
    const part = asArray(media?.Part)[0];
    if (part?.key) return { media, part };
  }
  return null;
}

function limitText(value, fallback, max = 250) {
  const text = String(value || fallback).trim();
  return text.slice(0, max) || fallback;
}

function appendToken(url, token) {
  url.searchParams.set('X-Plex-Token', token);
  return url.toString();
}

export class PlexClient {
  constructor({
    baseUrl,
    token,
    streamBaseUrl,
    musicLibrary = 'Music',
    maxTracks = 150,
    maxAudioBitrate = 192,
    transcodePolicy = 'auto',
    requestTimeoutMs = 10_000,
    fetchImpl = fetch
  }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.streamBaseUrl = streamBaseUrl.replace(/\/$/, '');
    this.musicLibrary = musicLibrary;
    this.maxTracks = maxTracks;
    this.maxAudioBitrate = maxAudioBitrate;
    this.transcodePolicy = transcodePolicy;
    this.requestTimeoutMs = requestTimeoutMs;
    this.fetchImpl = fetchImpl;
    this.musicSectionKey = null;
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: false,
      trimValues: true
    });
  }

  async request(path, searchParams = {}, { method = 'GET' } = {}) {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Accept: 'application/xml',
        'X-Plex-Token': this.token,
        'X-Plex-Product': 'Alexa Plex Music',
        'X-Plex-Version': '1.0.0',
        'X-Plex-Device': 'Alexa',
        'X-Plex-Client-Identifier': 'alexa-plex-proxy-lambda'
      },
      signal: AbortSignal.timeout(this.requestTimeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Plex request failed with status ${response.status}`);
    }

    if (method === 'HEAD') return {};
    const xml = await response.text();
    return this.parser.parse(xml)?.MediaContainer ?? {};
  }

  async getMusicSectionKey() {
    if (this.musicSectionKey) return this.musicSectionKey;

    const container = await this.request('/library/sections');
    const sections = asArray(container.Directory);
    const exact = sections.find(
      (item) => item.type === 'artist'
        && String(item.title).toLowerCase() === this.musicLibrary.toLowerCase()
    );
    const section = exact ?? sections.find((item) => item.type === 'artist');

    if (!section?.key) {
      throw new Error(`No Plex music library found. Expected '${this.musicLibrary}'.`);
    }

    this.musicSectionKey = String(section.key);
    return this.musicSectionKey;
  }

  async searchLibrary(kind, query, limit = 75) {
    const sectionKey = await this.getMusicSectionKey();
    const type = MEDIA_TYPES[kind];
    if (!type) throw new Error(`Unsupported Plex media kind: ${kind}`);

    let container = await this.request(`/library/sections/${sectionKey}/all`, {
      type,
      title: query,
      'X-Plex-Container-Start': 0,
      'X-Plex-Container-Size': limit
    });
    let items = containerItems(container);

    if (items.length === 0) {
      container = await this.request(`/library/sections/${sectionKey}/search`, {
        type,
        query,
        'X-Plex-Container-Start': 0,
        'X-Plex-Container-Size': limit
      });
      items = containerItems(container);
    }

    return items;
  }

  async searchPlaylists() {
    const container = await this.request('/playlists', {
      playlistType: 'audio',
      'X-Plex-Container-Start': 0,
      'X-Plex-Container-Size': 500
    });
    return containerItems(container);
  }

  async tracksFor(kind, item) {
    if (kind === 'track') return [item];

    const options = {
      'X-Plex-Container-Start': 0,
      'X-Plex-Container-Size': this.maxTracks
    };

    if (kind === 'artist') {
      return containerItems(
        await this.request(`/library/metadata/${item.ratingKey}/allLeaves`, options)
      );
    }
    if (kind === 'album') {
      return containerItems(
        await this.request(`/library/metadata/${item.ratingKey}/children`, options)
      );
    }
    if (kind === 'playlist') {
      return containerItems(
        await this.request(`/playlists/${item.ratingKey}/items`, options)
      );
    }
    throw new Error(`Unsupported Plex media kind: ${kind}`);
  }

  normalizeTrack(item) {
    const selected = firstPart(item);
    if (!selected) return null;

    const { media, part } = selected;
    const container = String(part.container || media.container || '').toLowerCase();
    const audioCodec = String(media.audioCodec || '').toLowerCase();
    const bitrate = Number.parseInt(media.bitrate ?? part.bitrate ?? '0', 10) || 0;
    const ratingKey = String(item.ratingKey ?? item.key ?? '').replace(/\D/g, '');
    if (!ratingKey) return null;

    const directPlayable = DIRECT_CONTAINERS.has(container)
      && DIRECT_CODECS.has(audioCodec)
      && (bitrate === 0 || bitrate <= 384);

    return {
      ratingKey,
      title: limitText(item.title, 'Unknown track'),
      artist: limitText(item.originalTitle || item.grandparentTitle || item.artist, 'Unknown artist'),
      album: limitText(item.parentTitle || item.album, 'Unknown album'),
      durationMs: Number.parseInt(item.duration ?? part.duration ?? media.duration ?? '0', 10) || 0,
      partPath: String(part.key),
      thumbPath: item.thumb || item.parentThumb || item.grandparentThumb || null,
      container: container || null,
      audioCodec: audioCodec || null,
      bitrate,
      directPlayable
    };
  }

  async resolveSpecific(kind, query) {
    const candidates = kind === 'playlist'
      ? await this.searchPlaylists()
      : await this.searchLibrary(kind, query);
    const matched = bestMatch(query, candidates, (item) => item.title ?? '');
    if (!matched || matched.score < 0.42) return null;

    const tracks = (await this.tracksFor(kind, matched.candidate))
      .map((item) => this.normalizeTrack(item))
      .filter(Boolean)
      .slice(0, this.maxTracks);
    if (tracks.length === 0) return null;

    return {
      kind,
      title: limitText(matched.candidate.title, query),
      score: matched.score,
      tracks
    };
  }

  async resolve(kind, query) {
    const cleanQuery = String(query ?? '').trim();
    if (!cleanQuery) throw new Error('A search query is required');

    if (kind !== 'any') return this.resolveSpecific(kind, cleanQuery);

    const priorities = { track: 0.04, artist: 0.03, album: 0.02, playlist: 0 };
    const results = await Promise.all(
      ['track', 'artist', 'album', 'playlist'].map(async (candidateKind) => {
        try {
          return await this.resolveSpecific(candidateKind, cleanQuery);
        } catch (error) {
          console.warn('Plex search branch failed', {
            kind: candidateKind,
            message: error.message
          });
          return null;
        }
      })
    );

    return results
      .filter(Boolean)
      .sort((left, right) =>
        (right.score + priorities[right.kind]) - (left.score + priorities[left.kind]))[0] ?? null;
  }

  shouldTranscode(track) {
    if (this.transcodePolicy === 'always') return true;
    if (this.transcodePolicy === 'never') return false;
    return !track.directPlayable;
  }

  buildAudioUrl(track, sessionId = randomUUID()) {
    if (!this.shouldTranscode(track)) {
      const url = new URL(track.partPath, `${this.streamBaseUrl}/`);
      return appendToken(url, this.token);
    }

    const url = new URL('/audio/:/transcode/universal/start.mp3', `${this.streamBaseUrl}/`);
    const params = {
      path: `/library/metadata/${track.ratingKey}`,
      mediaIndex: 0,
      partIndex: 0,
      protocol: 'http',
      directPlay: 0,
      directStream: 0,
      directStreamAudio: 0,
      musicBitrate: this.maxAudioBitrate,
      session: sessionId,
      transcodeSessionId: sessionId,
      'X-Plex-Product': 'Alexa Plex Music',
      'X-Plex-Version': '1.0.0',
      'X-Plex-Device': 'Alexa',
      'X-Plex-Platform': 'Web',
      'X-Plex-Client-Identifier': 'alexa-plex-proxy-lambda',
      'X-Plex-Token': this.token
    };
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  buildArtworkUrl(track) {
    if (!track.thumbPath) return null;
    const url = new URL(track.thumbPath, `${this.streamBaseUrl}/`);
    return appendToken(url, this.token);
  }

  async reportPlayback(track, state, timeMs = 0) {
    try {
      await this.request('/:/timeline', {
        ratingKey: track.ratingKey,
        key: `/library/metadata/${track.ratingKey}`,
        state,
        time: Math.max(0, Number(timeMs) || 0),
        duration: track.durationMs || 0
      });
    } catch (error) {
      console.warn('Plex timeline update failed', { state, message: redactPlexSecrets(error.message) });
    }
  }
}
