import { randomUUID } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { lrcToWebVtt } from './lyrics.js';
import { bestMatch, matchScore } from './matching.js';

const MEDIA_TYPES = {
  artist: 8,
  album: 9,
  track: 10
};
const DIRECT_CONTAINERS = new Set(['mp3', 'aac', 'm4a', 'mp4']);
const DIRECT_CODECS = new Set(['mp3', 'aac']);
const LIBRARY_IDENTIFIER = 'com.plexapp.plugins.library';

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
    ...asArray(container?.Playlist),
    ...asArray(container?.Metadata)
  ];
}

function firstPart(item) {
  for (const media of asArray(item?.Media)) {
    const part = asArray(media?.Part)[0];
    if (part?.key) return { media, part };
  }
  return null;
}

function lyricStream(item) {
  for (const media of asArray(item?.Media)) {
    for (const part of asArray(media?.Part)) {
      for (const stream of asArray(part?.Stream)) {
        const streamType = Number.parseInt(stream.streamType ?? '0', 10);
        const codec = String(stream.codec || stream.format || '').toLowerCase();
        if (streamType !== 4) continue;
        return {
          key: stream.key || (stream.id ? `/library/streams/${stream.id}` : null),
          codec,
          timed: String(stream.timed ?? '') === '1' || codec === 'lrc'
        };
      }
    }
  }
  return null;
}

function limitText(value, fallback, max = 250) {
  const text = String(value || fallback).trim();
  return text.slice(0, max) || fallback;
}

function dedupeTracks(tracks) {
  const seen = new Set();
  return tracks.filter((track) => {
    if (!track || seen.has(track.ratingKey)) return false;
    seen.add(track.ratingKey);
    return true;
  });
}

function parseSongArtistQuery(query) {
  const match = /^(.+?)\s+by\s+(.+)$/i.exec(String(query ?? '').trim());
  if (!match) return null;
  return { title: match[1].trim(), artist: match[2].trim() };
}

function normalizeDecade(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[’']/g, '');
  const words = {
    twenties: 2020,
    'two thousands': 2000,
    'two thousand': 2000,
    'aughts': 2000,
    'noughties': 2000,
    nineties: 1990,
    eighties: 1980,
    seventies: 1970,
    sixties: 1960,
    fifties: 1950,
    forties: 1940
  };
  if (words[normalized]) return words[normalized];

  const fourDigit = /(19|20)\d0/.exec(normalized);
  if (fourDigit) return Number.parseInt(fourDigit[0], 10);

  const short = /^(\d{2})s?$/.exec(normalized.replace(/\s/g, ''));
  if (short) {
    const number = Number.parseInt(short[1], 10);
    return number <= 29 ? 2000 + number : 1900 + number;
  }
  return null;
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
    lyricsMode = 'plex-lrclib',
    lyricsRequestTimeoutMs = 2500,
    radioTrackLimit = 50,
    allowPlaylistWrites = true,
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
    this.lyricsMode = lyricsMode;
    this.lyricsRequestTimeoutMs = lyricsRequestTimeoutMs;
    this.radioTrackLimit = radioTrackLimit;
    this.allowPlaylistWrites = allowPlaylistWrites;
    this.fetchImpl = fetchImpl;
    this.musicSectionKey = null;
    this.serverIdentity = null;
    this.lyricsCache = new Map();
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: false,
      trimValues: true
    });
  }

  headers(accept = 'application/xml') {
    return {
      Accept: accept,
      'X-Plex-Token': this.token,
      'X-Plex-Product': 'Alexa Plex Music',
      'X-Plex-Version': '2.0.0',
      'X-Plex-Device': 'Alexa',
      'X-Plex-Client-Identifier': 'alexa-plex-proxy-lambda'
    };
  }

  async fetchPlex(path, searchParams = {}, { method = 'GET', accept = 'application/xml', timeoutMs } = {}) {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await this.fetchImpl(url, {
      method,
      headers: this.headers(accept),
      signal: AbortSignal.timeout(timeoutMs ?? this.requestTimeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Plex request failed with status ${response.status}`);
    }
    return response;
  }

  async request(path, searchParams = {}, { method = 'GET' } = {}) {
    const response = await this.fetchPlex(path, searchParams, { method });
    if (method === 'HEAD' || response.status === 204) return {};
    const xml = await response.text();
    if (!xml.trim()) return {};
    return this.parser.parse(xml)?.MediaContainer ?? {};
  }

  async requestText(path, searchParams = {}, timeoutMs = this.lyricsRequestTimeoutMs) {
    const response = await this.fetchPlex(path, searchParams, {
      accept: 'text/plain, text/lrc, */*',
      timeoutMs
    });
    return response.text();
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

  async getServerIdentity() {
    if (this.serverIdentity) return this.serverIdentity;
    const identity = await this.request('/identity');
    const machineIdentifier = identity.machineIdentifier || identity.machineidentifier;
    if (!machineIdentifier) throw new Error('Plex did not return a machine identifier');
    this.serverIdentity = {
      machineIdentifier: String(machineIdentifier),
      friendlyName: identity.friendlyName || identity.friendlyname || 'Plex',
      version: identity.version || null
    };
    return this.serverIdentity;
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      const identity = await this.request('/identity');
      const machineIdentifier = identity.machineIdentifier || identity.machineidentifier;
      if (!machineIdentifier) throw new Error('Plex did not return a machine identifier');
      this.serverIdentity = {
        machineIdentifier: String(machineIdentifier),
        friendlyName: identity.friendlyName || identity.friendlyname || 'Plex',
        version: identity.version || null
      };
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        friendlyName: this.serverIdentity.friendlyName,
        version: this.serverIdentity.version
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: redactPlexSecrets(error.message)
      };
    }
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
    const lyrics = lyricStream(item);

    const directPlayable = DIRECT_CONTAINERS.has(container)
      && DIRECT_CODECS.has(audioCodec)
      && (bitrate === 0 || bitrate <= 384);

    return {
      ratingKey,
      title: limitText(item.title, 'Unknown track'),
      artist: limitText(item.originalTitle || item.grandparentTitle || item.artist, 'Unknown artist'),
      album: limitText(item.parentTitle || item.album, 'Unknown album'),
      year: Number.parseInt(item.parentYear ?? item.year ?? '0', 10) || 0,
      durationMs: Number.parseInt(item.duration ?? part.duration ?? media.duration ?? '0', 10) || 0,
      partPath: String(part.key),
      partId: part.id ? String(part.id) : null,
      parentRatingKey: item.parentRatingKey ? String(item.parentRatingKey) : null,
      grandparentRatingKey: item.grandparentRatingKey ? String(item.grandparentRatingKey) : null,
      thumbPath: item.thumb || item.parentThumb || item.grandparentThumb || null,
      artPath: item.art || item.parentArt || item.grandparentArt || null,
      lyricsKey: lyrics?.key ?? null,
      lyricsCodec: lyrics?.codec ?? null,
      lyricsTimed: lyrics?.timed ?? false,
      userRating: Number.parseFloat(item.userRating ?? '0') || 0,
      container: container || null,
      audioCodec: audioCodec || null,
      bitrate,
      directPlayable
    };
  }

  async resolveTrack(query) {
    const split = parseSongArtistQuery(query);
    const searchQueries = [...new Set([query, split?.title].filter(Boolean))];
    const candidateLists = await Promise.all(searchQueries.map((value) => this.searchLibrary('track', value)));
    const candidates = dedupeTracks(
      candidateLists.flat().map((item) => this.normalizeTrack(item)).filter(Boolean)
    );

    let best = null;
    for (const candidate of candidates) {
      const directScore = Math.max(
        matchScore(query, candidate.title),
        matchScore(query, `${candidate.title} ${candidate.artist}`)
      );
      const compositeScore = split
        ? (matchScore(split.title, candidate.title) * 0.78)
          + (matchScore(split.artist, candidate.artist) * 0.22)
        : 0;
      const score = Math.max(directScore, compositeScore);
      if (!best || score > best.score) best = { candidate, score };
    }

    if (!best || best.score < 0.42) return null;
    return {
      kind: 'track',
      title: limitText(`${best.candidate.title} by ${best.candidate.artist}`, query),
      score: best.score,
      tracks: [best.candidate]
    };
  }

  async resolveSpecific(kind, query) {
    if (kind === 'track') return this.resolveTrack(query);
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
            message: redactPlexSecrets(error.message)
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

  async resolveGenre(query) {
    const cleanQuery = String(query ?? '').trim();
    if (!cleanQuery) return null;
    const sectionKey = await this.getMusicSectionKey();

    for (const filterName of ['genre', 'style', 'mood']) {
      try {
        const container = await this.request(`/library/sections/${sectionKey}/all`, {
          type: MEDIA_TYPES.track,
          [filterName]: cleanQuery,
          'X-Plex-Container-Start': 0,
          'X-Plex-Container-Size': this.maxTracks
        });
        const tracks = containerItems(container)
          .map((item) => this.normalizeTrack(item))
          .filter(Boolean)
          .slice(0, this.maxTracks);
        if (tracks.length > 0) {
          return {
            kind: filterName,
            title: cleanQuery,
            score: 1,
            tracks
          };
        }
      } catch (error) {
        console.warn('Plex music filter failed', {
          filterName,
          message: redactPlexSecrets(error.message)
        });
      }
    }
    return null;
  }

  async resolveDecade(value) {
    const startYear = normalizeDecade(value);
    if (!startYear) return null;
    const endYear = startYear + 9;
    const sectionKey = await this.getMusicSectionKey();

    let container = await this.request(`/library/sections/${sectionKey}/all`, {
      type: MEDIA_TYPES.track,
      'year>=': startYear,
      'year<=': endYear,
      'X-Plex-Container-Start': 0,
      'X-Plex-Container-Size': this.maxTracks
    });
    let tracks = containerItems(container)
      .map((item) => this.normalizeTrack(item))
      .filter((track) => track && track.year >= startYear && track.year <= endYear);

    if (tracks.length === 0) {
      container = await this.request(`/library/sections/${sectionKey}/all`, {
        type: MEDIA_TYPES.track,
        'X-Plex-Container-Start': 0,
        'X-Plex-Container-Size': Math.min(500, this.maxTracks * 4)
      });
      tracks = containerItems(container)
        .map((item) => this.normalizeTrack(item))
        .filter((track) => track && track.year >= startYear && track.year <= endYear);
    }

    tracks = tracks.slice(0, this.maxTracks);
    if (tracks.length === 0) return null;
    return {
      kind: 'decade',
      title: `the ${startYear}s`,
      score: 1,
      tracks
    };
  }

  async radioForTrack(track) {
    if (!track?.ratingKey) return null;
    let tracks = [];
    try {
      const container = await this.request(`/library/metadata/${track.ratingKey}/nearest`, {
        limit: this.radioTrackLimit,
        excludeParentID: track.parentRatingKey,
        excludeGrandparentID: track.grandparentRatingKey
      });
      tracks = containerItems(container)
        .map((item) => this.normalizeTrack(item))
        .filter(Boolean);
    } catch (error) {
      console.warn('Plex sonic radio unavailable; using artist fallback', {
        ratingKey: track.ratingKey,
        message: redactPlexSecrets(error.message)
      });
    }

    if (tracks.length === 0 && track.grandparentRatingKey) {
      try {
        tracks = (await this.tracksFor('artist', { ratingKey: track.grandparentRatingKey }))
          .map((item) => this.normalizeTrack(item))
          .filter(Boolean);
      } catch (error) {
        console.warn('Artist radio fallback failed', { message: redactPlexSecrets(error.message) });
      }
    }

    if (tracks.length === 0) {
      const artistResult = await this.resolveSpecific('artist', track.artist);
      tracks = artistResult?.tracks ?? [];
    }

    const radioTracks = dedupeTracks([track, ...tracks]).slice(0, this.radioTrackLimit);
    if (radioTracks.length === 0) return null;
    return {
      kind: 'radio',
      title: `${track.title} radio`,
      score: 1,
      tracks: radioTracks
    };
  }

  async rateTrack(track, rating) {
    const parsedRating = Number(rating);
    if (!Number.isFinite(parsedRating)) throw new Error('Rating must be a number');
    const numericRating = Math.max(0, Math.min(10, parsedRating));
    await this.request('/:/rate', {
      identifier: LIBRARY_IDENTIFIER,
      key: track.ratingKey,
      rating: numericRating
    }, { method: 'PUT' });
    track.userRating = numericRating;
    return numericRating;
  }

  async addTrackToPlaylist(track, playlistName) {
    if (!this.allowPlaylistWrites) return { ok: false, reason: 'disabled' };
    const playlists = await this.searchPlaylists();
    const matched = bestMatch(playlistName, playlists, (item) => item.title ?? '');
    if (!matched || matched.score < 0.55) return { ok: false, reason: 'not-found' };
    const playlist = matched.candidate;
    if (String(playlist.smart ?? '0') === '1' || playlist.smart === true) {
      return { ok: false, reason: 'smart', title: playlist.title };
    }

    const identity = await this.getServerIdentity();
    const uri = `server://${identity.machineIdentifier}/${LIBRARY_IDENTIFIER}/library/metadata/${track.ratingKey}`;
    await this.request(`/playlists/${playlist.ratingKey}/items`, { uri }, { method: 'PUT' });
    return { ok: true, title: playlist.title };
  }

  shouldTranscode(track) {
    if (this.transcodePolicy === 'always') return true;
    if (this.transcodePolicy === 'never') return false;
    return !track.directPlayable;
  }

  buildAudioUrl(track, sessionId = randomUUID()) {
    if (!this.shouldTranscode(track)) {
      return new URL(track.partPath, `${this.streamBaseUrl}/`).toString();
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
      'X-Plex-Version': '2.0.0',
      'X-Plex-Device': 'Alexa',
      'X-Plex-Platform': 'Web',
      'X-Plex-Client-Identifier': 'alexa-plex-proxy-lambda'
    };
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  artworkPath(track, background = false) {
    if (background) return track.artPath || track.thumbPath || '/:/resources/music.png';
    return track.thumbPath || '/:/resources/music.png';
  }

  buildArtworkUrl(track) {
    return new URL(this.artworkPath(track, false), `${this.streamBaseUrl}/`).toString();
  }

  buildArtworkSources(track, { background = false } = {}) {
    const sourcePath = this.artworkPath(track, background);
    const directUrl = new URL(sourcePath, `${this.streamBaseUrl}/`).toString();
    const transcodeUrl = new URL('/photo/:/transcode', `${this.streamBaseUrl}/`);
    const width = background ? 1920 : 1200;
    const height = background ? 1080 : 1200;
    transcodeUrl.searchParams.set('url', sourcePath);
    transcodeUrl.searchParams.set('width', String(width));
    transcodeUrl.searchParams.set('height', String(height));
    transcodeUrl.searchParams.set('minSize', '1');
    transcodeUrl.searchParams.set('upscale', '1');
    transcodeUrl.searchParams.set('format', 'jpg');
    transcodeUrl.searchParams.set('quality', '95');
    return [{ url: transcodeUrl.toString() }, { url: directUrl }];
  }

  async getTrackDetails(track) {
    const container = await this.request(`/library/metadata/${track.ratingKey}`, {
      includeGuids: 1
    });
    const item = containerItems(container)[0];
    return item ? this.normalizeTrack(item) : null;
  }

  async getPlexTimedLyrics(track) {
    let candidate = track;
    if (!candidate.lyricsKey) {
      candidate = await this.getTrackDetails(track) ?? track;
    }
    if (!candidate.lyricsKey || !candidate.lyricsTimed || candidate.lyricsCodec !== 'lrc') return null;
    const lrc = await this.requestText(candidate.lyricsKey);
    return lrcToWebVtt(lrc, { durationMs: track.durationMs });
  }

  async fetchLrcLibJson(url) {
    const response = await this.fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'alexa-plex-proxy/2.0 (https://github.com/guy16510/alexa-plex-proxy)'
      },
      signal: AbortSignal.timeout(this.lyricsRequestTimeoutMs)
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`LRCLIB request failed with status ${response.status}`);
    return response.json();
  }

  async getLrcLibTimedLyrics(track) {
    const durationSeconds = track.durationMs > 0 ? Math.round(track.durationMs / 1000) : 0;
    const knownAlbum = track.album && track.album !== 'Unknown album';

    if (knownAlbum && durationSeconds > 0) {
      const exactUrl = new URL('https://lrclib.net/api/get-cached');
      exactUrl.searchParams.set('track_name', track.title);
      exactUrl.searchParams.set('artist_name', track.artist);
      exactUrl.searchParams.set('album_name', track.album);
      exactUrl.searchParams.set('duration', String(durationSeconds));
      const exact = await this.fetchLrcLibJson(exactUrl);
      if (exact?.syncedLyrics) {
        return lrcToWebVtt(exact.syncedLyrics, { durationMs: track.durationMs });
      }
    }

    const searchUrl = new URL('https://lrclib.net/api/search');
    searchUrl.searchParams.set('track_name', track.title);
    searchUrl.searchParams.set('artist_name', track.artist);
    const results = await this.fetchLrcLibJson(searchUrl);
    if (!Array.isArray(results)) return null;

    let best = null;
    for (const candidate of results) {
      if (!candidate?.syncedLyrics) continue;
      const titleScore = matchScore(track.title, candidate.trackName);
      const artistScore = matchScore(track.artist, candidate.artistName);
      if (titleScore < 0.7 || artistScore < 0.6) continue;
      const candidateDuration = Number(candidate.duration) || 0;
      const durationDifference = durationSeconds > 0 && candidateDuration > 0
        ? Math.abs(durationSeconds - candidateDuration)
        : 0;
      if (durationDifference > 8) continue;
      const albumScore = knownAlbum ? matchScore(track.album, candidate.albumName) : 0.5;
      const score = (titleScore * 0.55) + (artistScore * 0.3) + (albumScore * 0.1)
        + (durationDifference <= 2 ? 0.05 : 0);
      if (!best || score > best.score) best = { candidate, score };
    }

    return best
      ? lrcToWebVtt(best.candidate.syncedLyrics, { durationMs: track.durationMs })
      : null;
  }

  async lookupTimedLyrics(track) {
    if (this.lyricsMode === 'off') return null;
    try {
      const plexLyrics = await this.getPlexTimedLyrics(track);
      if (plexLyrics) return plexLyrics;
    } catch (error) {
      console.warn('Plex lyrics lookup failed', {
        ratingKey: track.ratingKey,
        message: redactPlexSecrets(error.message)
      });
    }

    if (this.lyricsMode !== 'plex-lrclib') return null;
    try {
      return await this.getLrcLibTimedLyrics(track);
    } catch (error) {
      console.warn('LRCLIB lyrics lookup failed', {
        ratingKey: track.ratingKey,
        message: redactPlexSecrets(error.message)
      });
      return null;
    }
  }

  async getTimedLyrics(track) {
    if (!track?.ratingKey || this.lyricsMode === 'off') return null;
    if (!this.lyricsCache.has(track.ratingKey)) {
      this.lyricsCache.set(track.ratingKey, this.lookupTimedLyrics(track));
    }
    return this.lyricsCache.get(track.ratingKey);
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
