import Alexa from 'ask-sdk-core';
import {
  aplDirective,
  confirmationDocument,
  homeDocument,
  lyricsDocument,
  queueDocument,
  supportsApl
} from './apl.js';
import { parseWebVtt, lyricWindow, shiftWebVtt } from './lyrics.js';
import { playDirective, stopDirective } from './playback.js';
import {
  createQueue,
  getNextIndex,
  getPreviousIndex,
  getTrackAt,
  moveTo,
  setShuffle
} from './queue.js';
import { getUserId } from './request-utils.js';
import { config, plex, queueStore, respond } from './runtime.js';

const PLAY_INTENTS = new Set([
  'PlaySongIntent',
  'PlayArtistIntent',
  'PlayAlbumIntent',
  'PlayPlaylistIntent',
  'PlayAnyIntent',
  'ShuffleArtistIntent',
  'ShufflePlaylistIntent'
]);

function intentDetails(intentName) {
  return {
    PlaySongIntent: { kind: 'track', shuffle: false },
    PlayArtistIntent: { kind: 'artist', shuffle: false },
    PlayAlbumIntent: { kind: 'album', shuffle: false },
    PlayPlaylistIntent: { kind: 'playlist', shuffle: false },
    PlayAnyIntent: { kind: 'any', shuffle: false },
    ShuffleArtistIntent: { kind: 'artist', shuffle: true },
    ShufflePlaylistIntent: { kind: 'playlist', shuffle: true }
  }[intentName] ?? { kind: 'any', shuffle: false };
}

function slotValue(handlerInput, name) {
  return handlerInput.requestEnvelope?.request?.intent?.slots?.[name]?.value?.trim() || null;
}

function audioOffset(handlerInput, queue) {
  const contextOffset = Number(handlerInput.requestEnvelope?.context?.AudioPlayer?.offsetInMilliseconds);
  return Number.isFinite(contextOffset) && contextOffset >= 0
    ? contextOffset
    : Math.max(0, Number(queue?.offsetMs) || 0);
}

function durationLabel(durationMs) {
  const totalSeconds = Math.max(0, Math.round((Number(durationMs) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function artFor(track) {
  return {
    artUrl: plex.buildArtworkSources(track, { background: false })[0]?.url || '',
    backgroundImage: plex.buildArtworkSources(track, { background: true })[0]?.url || ''
  };
}

function findNextPlayableIndex(queue) {
  let candidate = queue.index;
  for (let attempts = 0; attempts < queue.order.length; attempts += 1) {
    candidate = getNextIndex(queue, candidate);
    if (candidate == null || candidate === queue.index) return null;
    const track = getTrackAt(queue, candidate);
    if (track && track.userRating !== 0) return candidate;
  }
  return null;
}

function resetPlaybackGeneration(queue) {
  queue.generation = (Number(queue.generation) || 0) + 1;
  queue.enqueuedIndex = null;
  queue.retryCounts = {};
}

async function queueOrResponse(handlerInput) {
  const queue = await queueStore.get(getUserId(handlerInput));
  if (queue?.tracks?.length) return { queue, response: null };
  return {
    queue: null,
    response: handlerInput.responseBuilder.speak(respond('emptyQueue')).getResponse()
  };
}

function confirmationResponse(handlerInput, result, query) {
  const alternatives = result.alternatives?.length
    ? result.alternatives
    : [{
      kind: result.kind,
      query: result.title,
      title: result.title,
      subtitle: result.kind
    }];
  return handlerInput.responseBuilder
    .speak(`I found a couple of matches for ${query}. Tap the right one.`)
    .addDirective(aplDirective(
      confirmationDocument({ query, alternatives }),
      {},
      `server-music:confirm:${Date.now()}`
    ))
    .reprompt('Tap a match, or say the full artist or song name.')
    .getResponse();
}

export async function startResolvedResult(handlerInput, result, {
  shuffle = false,
  speechKey = null,
  spokenTitle = null,
  force = false
} = {}) {
  const query = spokenTitle ?? result?.title ?? 'that';
  if (!force && result?.needsConfirmation && supportsApl(handlerInput)) {
    return confirmationResponse(handlerInput, result, query);
  }

  const userId = getUserId(handlerInput);
  const blockedTrackIds = await queueStore.getBlockedTrackIds(userId);
  const playableTracks = (result?.tracks ?? []).filter((track) => !blockedTrackIds.has(track.ratingKey));
  if (playableTracks.length === 0) {
    return handlerInput.responseBuilder
      .speak(respond('notFound', { query }))
      .getResponse();
  }

  const queue = createQueue(playableTracks.slice(0, config.maxQueueTracks), {
    sourceTitle: result.title,
    sourceKind: result.kind,
    ttlHours: config.queueTtlHours
  });
  if (shuffle) {
    moveTo(queue, Math.floor(Math.random() * queue.tracks.length));
    setShuffle(queue, true);
  }
  await queueStore.put(userId, queue);

  const key = speechKey ?? (shuffle ? 'shuffling' : 'playing');
  return handlerInput.responseBuilder
    .speak(respond(key, { title: result.title }))
    .addDirective(await playDirective({ queue, position: queue.index, plex }))
    .withShouldEndSession(true)
    .getResponse();
}

export async function renderHome(handlerInput, { speak = null } = {}) {
  const content = await plex.homeContent();
  const builder = handlerInput.responseBuilder;
  if (speak) builder.speak(speak);
  return builder
    .addDirective(aplDirective(homeDocument(content), {}, `server-music:home:${Date.now()}`))
    .getResponse();
}

export async function renderQueue(handlerInput, queue, { speak = null } = {}) {
  const track = getTrackAt(queue);
  if (!track) return handlerInput.responseBuilder.speak(respond('emptyQueue')).getResponse();
  const visualQueue = {
    ...queue,
    tracks: queue.tracks.map((item) => ({
      ...item,
      durationLabel: durationLabel(item.durationMs)
    }))
  };
  const { artUrl, backgroundImage } = artFor(track);
  const builder = handlerInput.responseBuilder;
  if (speak) builder.speak(speak);
  return builder
    .addDirective(aplDirective(
      queueDocument({ queue: visualQueue, track, artUrl, backgroundImage }),
      {},
      `server-music:queue:${queue.id}:${queue.generation}`
    ))
    .getResponse();
}

function buildLyricTimeline(cues, positionMs, currentIndex) {
  if (!Array.isArray(cues) || currentIndex < 0) return [];
  const timeline = [];
  let previousStart = positionMs;
  for (let index = currentIndex + 1; index < cues.length && timeline.length < 25; index += 1) {
    const cue = cues[index];
    const delayMs = Math.max(0, cue.startMs - previousStart);
    timeline.push({
      delayMs,
      previousLine: cues[index - 1]?.text || '',
      currentLine: cue.text,
      nextLine: cues[index + 1]?.text || ''
    });
    previousStart = cue.startMs;
  }
  return timeline;
}

export async function renderLyrics(handlerInput, queue, { speak = null } = {}) {
  const track = getTrackAt(queue);
  if (!track) return handlerInput.responseBuilder.speak(respond('emptyQueue')).getResponse();
  const positionMs = audioOffset(handlerInput, queue);
  let cues = [];
  try {
    const webVtt = await plex.getTimedLyrics(track);
    cues = parseWebVtt(shiftWebVtt(webVtt, queue.lyricsOffsetMs ?? 0));
  } catch (error) {
    console.warn('Custom lyrics screen lookup failed', {
      ratingKey: track.ratingKey,
      message: error.message
    });
  }
  const window = lyricWindow(cues, positionMs);
  const timeline = buildLyricTimeline(cues, positionMs, window.index);
  const { artUrl, backgroundImage } = artFor(track);
  const offsetSeconds = (Number(queue.lyricsOffsetMs) || 0) / 1000;
  const builder = handlerInput.responseBuilder;
  if (speak) builder.speak(speak);
  return builder
    .addDirective(aplDirective(
      lyricsDocument({
        track,
        artUrl,
        backgroundImage,
        previousLine: window.previousLine,
        currentLine: window.currentLine || 'No synchronized lyrics found.',
        nextLine: window.nextLine,
        offsetLabel: `Lyrics offset ${offsetSeconds.toFixed(1)}s`,
        timeline
      }),
      {},
      `server-music:lyrics:${queue.id}:${queue.generation}`
    ))
    .getResponse();
}

export const VisualLaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest'
      && supportsApl(handlerInput);
  },
  async handle(handlerInput) {
    return renderHome(handlerInput, { speak: respond('launch') });
  }
};

export const VisualPlayMediaIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && PLAY_INTENTS.has(Alexa.getIntentName(handlerInput.requestEnvelope));
  },
  async handle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const { kind, shuffle } = intentDetails(intentName);
    const query = slotValue(handlerInput, 'query');
    if (!query) {
      return handlerInput.responseBuilder
        .speak(respond('missingQuery'))
        .reprompt('Try saying, play songs by Queen.')
        .getResponse();
    }
    const result = await plex.resolve(kind, query);
    return startResolvedResult(handlerInput, result, { shuffle, spokenTitle: query });
  }
};

export const ShowHomeIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ShowHomeIntent';
  },
  async handle(handlerInput) {
    if (!supportsApl(handlerInput)) {
      return handlerInput.responseBuilder.speak('Open Burns Jukebox on an Echo Show for the visual library.').getResponse();
    }
    return renderHome(handlerInput);
  }
};

export const ShowQueueIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ShowQueueIntent';
  },
  async handle(handlerInput) {
    const { queue, response } = await queueOrResponse(handlerInput);
    if (response) return response;
    if (!supportsApl(handlerInput)) {
      return handlerInput.responseBuilder
        .speak(`There are ${queue.tracks.length} tracks queued. ${getTrackAt(queue).title} is playing.`)
        .getResponse();
    }
    return renderQueue(handlerInput, queue);
  }
};

export const ShowLyricsIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ShowLyricsIntent';
  },
  async handle(handlerInput) {
    const { queue, response } = await queueOrResponse(handlerInput);
    if (response) return response;
    if (!supportsApl(handlerInput)) {
      return handlerInput.responseBuilder.speak('Lyrics need an Echo Show screen.').getResponse();
    }
    return renderLyrics(handlerInput, queue);
  }
};

async function moveAndPlay(handlerInput, queue, targetPosition, speechKey) {
  if (targetPosition == null || !moveTo(queue, targetPosition)) {
    return handlerInput.responseBuilder.speak(respond(speechKey === 'previous' ? 'firstTrack' : 'lastTrack')).getResponse();
  }
  resetPlaybackGeneration(queue);
  await queueStore.put(getUserId(handlerInput), queue);
  return handlerInput.responseBuilder
    .speak(respond(speechKey))
    .addDirective(await playDirective({ queue, position: queue.index, plex }))
    .withShouldEndSession(true)
    .getResponse();
}

export const AplUserEventHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'Alexa.Presentation.APL.UserEvent';
  },
  async handle(handlerInput) {
    const [action, first, second] = handlerInput.requestEnvelope.request.arguments ?? [];
    const userId = getUserId(handlerInput);

    if (action === 'home') return renderHome(handlerInput);

    if (action === 'play') {
      const kind = String(first || 'any');
      const query = String(second || '').trim();
      const result = await plex.resolve(kind, query);
      return startResolvedResult(handlerInput, result, { spokenTitle: query, force: true });
    }

    const { queue, response } = await queueOrResponse(handlerInput);
    if (response) return response;
    const track = getTrackAt(queue);

    if (action === 'showQueue') return renderQueue(handlerInput, queue);
    if (action === 'showLyrics') return renderLyrics(handlerInput, queue);

    if (action === 'queueSelect') {
      const target = Number(first);
      if (!Number.isInteger(target) || !moveTo(queue, target)) {
        return renderQueue(handlerInput, queue, { speak: 'That queue item vanished. Weird.' });
      }
      resetPlaybackGeneration(queue);
      await queueStore.put(userId, queue);
      return handlerInput.responseBuilder
        .speak(respond('playing', { title: getTrackAt(queue).title }))
        .addDirective(await playDirective({ queue, position: queue.index, plex }))
        .withShouldEndSession(true)
        .getResponse();
    }

    if (action === 'next') {
      return moveAndPlay(handlerInput, queue, findNextPlayableIndex(queue), 'next');
    }
    if (action === 'previous') {
      return moveAndPlay(handlerInput, queue, getPreviousIndex(queue), 'previous');
    }

    if (action === 'seek') {
      const seconds = Math.max(-600, Math.min(600, Number(first) || 0));
      const maximum = track.durationMs > 1000 ? track.durationMs - 1000 : Number.POSITIVE_INFINITY;
      const target = Math.max(0, Math.min(maximum, audioOffset(handlerInput, queue) + (seconds * 1000)));
      queue.offsetMs = target;
      resetPlaybackGeneration(queue);
      await queueStore.put(userId, queue);
      return handlerInput.responseBuilder
        .speak(respond(seconds < 0 ? 'seekBackward' : 'seekForward', { seconds: Math.abs(seconds) }))
        .addDirective(await playDirective({ queue, position: queue.index, plex, offsetMs: target }))
        .withShouldEndSession(true)
        .getResponse();
    }

    if (action === 'favorite') {
      await queueStore.unblockTrack(userId, track.ratingKey);
      await plex.rateTrack(track, 10);
      await queueStore.put(userId, queue);
      return renderQueue(handlerInput, queue, { speak: respond('liked', { title: track.title }) });
    }

    if (action === 'ban') {
      await queueStore.blockTrack(userId, track.ratingKey);
      try {
        await plex.rateTrack(track, 0);
      } catch (error) {
        console.warn('Plex rating failed after visual ban', { message: error.message });
      }
      const nextIndex = findNextPlayableIndex(queue);
      if (nextIndex == null) {
        await queueStore.put(userId, queue);
        return handlerInput.responseBuilder
          .speak(respond('disliked', { title: track.title }))
          .addDirective(stopDirective())
          .withShouldEndSession(true)
          .getResponse();
      }
      moveTo(queue, nextIndex);
      resetPlaybackGeneration(queue);
      await queueStore.put(userId, queue);
      return handlerInput.responseBuilder
        .speak(respond('disliked', { title: track.title }))
        .addDirective(await playDirective({ queue, position: queue.index, plex }))
        .withShouldEndSession(true)
        .getResponse();
    }

    if (action === 'radio') {
      const result = await plex.radioForTrack(track);
      return startResolvedResult(handlerInput, result, {
        speechKey: 'radio',
        spokenTitle: track.title,
        force: true
      });
    }

    if (action === 'lyricsOffset') {
      const delta = Math.max(-5000, Math.min(5000, Number(first) || 0));
      queue.offsetMs = audioOffset(handlerInput, queue);
      queue.lyricsOffsetMs = Math.max(-30_000, Math.min(30_000, (Number(queue.lyricsOffsetMs) || 0) + delta));
      resetPlaybackGeneration(queue);
      await queueStore.put(userId, queue);
      handlerInput.responseBuilder.addDirective(await playDirective({
        queue,
        position: queue.index,
        plex,
        offsetMs: queue.offsetMs
      }));
      return renderLyrics(handlerInput, queue);
    }

    return renderQueue(handlerInput, queue, { speak: 'That button did absolutely nothing. Impressive.' });
  }
};
