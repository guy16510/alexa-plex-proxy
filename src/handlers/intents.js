import Alexa from 'ask-sdk-core';
import { canHandleIntent, getQueueOrSpeak } from '../handler-utils.js';
import { playDirective, stopDirective } from '../playback.js';
import {
  createQueue,
  getNextIndex,
  getPreviousIndex,
  getTrackAt,
  moveTo,
  setShuffle
} from '../queue.js';
import { getSlotValue, getUserId } from '../request-utils.js';
import { config, plex, queueStore, respond } from '../runtime.js';

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

async function playResult(handlerInput, result, {
  shuffle = false,
  speechKey = null,
  spokenTitle = null
} = {}) {
  const query = spokenTitle ?? result?.title ?? 'that';
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

function currentOffsetMs(handlerInput, queue) {
  const contextOffset = Number(handlerInput.requestEnvelope?.context?.AudioPlayer?.offsetInMilliseconds);
  return Number.isFinite(contextOffset) && contextOffset >= 0
    ? contextOffset
    : Math.max(0, Number(queue.offsetMs) || 0);
}

function requestedSeconds(handlerInput) {
  const raw = getSlotValue(handlerInput, 'seconds');
  if (raw === null || raw === undefined || String(raw).trim() === '') return 30;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(5, Math.min(600, Math.round(parsed)));
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

export const PlayMediaIntentHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
    return [
      'PlaySongIntent',
      'PlayArtistIntent',
      'PlayAlbumIntent',
      'PlayPlaylistIntent',
      'PlayAnyIntent',
      'ShuffleArtistIntent',
      'ShufflePlaylistIntent'
    ].includes(Alexa.getIntentName(handlerInput.requestEnvelope));
  },
  async handle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const { kind, shuffle } = intentDetails(intentName);
    const query = getSlotValue(handlerInput, 'query');
    if (!query) {
      return handlerInput.responseBuilder
        .speak(respond('missingQuery'))
        .reprompt('Try saying, play songs by Queen.')
        .getResponse();
    }

    const result = await plex.resolve(kind, query);
    return playResult(handlerInput, result, { shuffle, spokenTitle: query });
  }
};

export const PlayGenreIntentHandler = {
  canHandle: canHandleIntent('PlayGenreIntent'),
  async handle(handlerInput) {
    const genre = getSlotValue(handlerInput, 'genre');
    if (!genre) return handlerInput.responseBuilder.speak(respond('missingGenre')).getResponse();
    const result = await plex.resolveGenre(genre);
    return playResult(handlerInput, result, { shuffle: true, spokenTitle: genre });
  }
};

export const PlayDecadeIntentHandler = {
  canHandle: canHandleIntent('PlayDecadeIntent'),
  async handle(handlerInput) {
    const decade = getSlotValue(handlerInput, 'decade');
    if (!decade) return handlerInput.responseBuilder.speak(respond('missingDecade')).getResponse();
    const result = await plex.resolveDecade(decade);
    return playResult(handlerInput, result, { shuffle: true, spokenTitle: decade });
  }
};

export const PlayRadioIntentHandler = {
  canHandle: canHandleIntent('PlayRadioIntent'),
  async handle(handlerInput) {
    const query = getSlotValue(handlerInput, 'query');
    let seedTrack = null;

    if (query) {
      const seed = await plex.resolve('track', query);
      seedTrack = seed?.tracks?.[0] ?? null;
      if (!seedTrack) {
        return handlerInput.responseBuilder
          .speak(respond('notFound', { query }))
          .getResponse();
      }
    } else {
      const { queue, response } = await getQueueOrSpeak(handlerInput);
      if (response) return response;
      seedTrack = getTrackAt(queue);
    }

    const result = await plex.radioForTrack(seedTrack);
    return playResult(handlerInput, result, {
      speechKey: 'radio',
      spokenTitle: seedTrack.title
    });
  }
};

export const PauseIntentHandler = {
  canHandle: canHandleIntent('AMAZON.PauseIntent'),
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(respond('pause'))
      .addDirective(stopDirective())
      .withShouldEndSession(true)
      .getResponse();
  }
};

export const ResumeIntentHandler = {
  canHandle: canHandleIntent('AMAZON.ResumeIntent'),
  async handle(handlerInput) {
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    return handlerInput.responseBuilder
      .speak(respond('resume'))
      .addDirective(await playDirective({ queue, position: queue.index, plex, offsetMs: queue.offsetMs }))
      .withShouldEndSession(true)
      .getResponse();
  }
};

export const NextIntentHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
    return ['AMAZON.NextIntent', 'SkipTrackIntent'].includes(Alexa.getIntentName(handlerInput.requestEnvelope));
  },
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    const nextIndex = findNextPlayableIndex(queue);
    if (nextIndex == null) return handlerInput.responseBuilder.speak(respond('lastTrack')).getResponse();
    moveTo(queue, nextIndex);
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .speak(respond('next'))
      .addDirective(await playDirective({ queue, position: queue.index, plex }))
      .withShouldEndSession(true)
      .getResponse();
  }
};

export const PreviousIntentHandler = {
  canHandle: canHandleIntent('AMAZON.PreviousIntent'),
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    const previousIndex = getPreviousIndex(queue);
    if (previousIndex == null) return handlerInput.responseBuilder.speak(respond('firstTrack')).getResponse();
    moveTo(queue, previousIndex);
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .speak(respond('previous'))
      .addDirective(await playDirective({ queue, position: queue.index, plex }))
      .withShouldEndSession(true)
      .getResponse();
  }
};

export const StartOverIntentHandler = {
  canHandle: canHandleIntent('AMAZON.StartOverIntent'),
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    queue.offsetMs = 0;
    queue.generation += 1;
    queue.enqueuedIndex = null;
    queue.retryCounts = {};
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .speak(respond('startOver'))
      .addDirective(await playDirective({ queue, position: queue.index, plex, offsetMs: 0 }))
      .withShouldEndSession(true)
      .getResponse();
  }
};

function seekHandler(intentName, direction, responseKey) {
  return {
    canHandle: canHandleIntent(intentName),
    async handle(handlerInput) {
      const userId = getUserId(handlerInput);
      const { queue, response } = await getQueueOrSpeak(handlerInput);
      if (response) return response;
      const track = getTrackAt(queue);
      const seconds = requestedSeconds(handlerInput);
      const deltaMs = seconds * 1000 * direction;
      const rawTarget = currentOffsetMs(handlerInput, queue) + deltaMs;
      const maximum = track?.durationMs > 1000 ? track.durationMs - 1000 : Number.POSITIVE_INFINITY;
      const target = Math.max(0, Math.min(maximum, rawTarget));
      queue.offsetMs = target;
      queue.generation += 1;
      queue.enqueuedIndex = null;
      queue.retryCounts = {};
      await queueStore.put(userId, queue);
      return handlerInput.responseBuilder
        .speak(respond(responseKey, { seconds }))
        .addDirective(await playDirective({ queue, position: queue.index, plex, offsetMs: target }))
        .withShouldEndSession(true)
        .getResponse();
    }
  };
}

export const SeekForwardIntentHandler = seekHandler('SeekForwardIntent', 1, 'seekForward');
export const SeekBackwardIntentHandler = seekHandler('SeekBackwardIntent', -1, 'seekBackward');

export const ShuffleOnIntentHandler = {
  canHandle: canHandleIntent('AMAZON.ShuffleOnIntent'),
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    setShuffle(queue, true);
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .speak(respond('shuffleOn'))
      .addDirective(await playDirective({ queue, position: queue.index, plex }))
      .withShouldEndSession(true)
      .getResponse();
  }
};

export const ShuffleOffIntentHandler = {
  canHandle: canHandleIntent('AMAZON.ShuffleOffIntent'),
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    setShuffle(queue, false);
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .speak(respond('shuffleOff'))
      .addDirective(await playDirective({ queue, position: queue.index, plex }))
      .withShouldEndSession(true)
      .getResponse();
  }
};

function toggleQueueSetting(intentName, property, value, speechKey) {
  return {
    canHandle: canHandleIntent(intentName),
    async handle(handlerInput) {
      const userId = getUserId(handlerInput);
      const { queue, response } = await getQueueOrSpeak(handlerInput);
      if (response) return response;
      queue[property] = value;
      await queueStore.put(userId, queue);
      return handlerInput.responseBuilder.speak(respond(speechKey)).getResponse();
    }
  };
}

export const LoopOnIntentHandler = toggleQueueSetting('AMAZON.LoopOnIntent', 'loop', true, 'loopOn');
export const LoopOffIntentHandler = toggleQueueSetting('AMAZON.LoopOffIntent', 'loop', false, 'loopOff');

export const NowPlayingIntentHandler = {
  canHandle: canHandleIntent('NowPlayingIntent'),
  async handle(handlerInput) {
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    const track = getTrackAt(queue);
    return handlerInput.responseBuilder.speak(respond('nowPlaying', track)).getResponse();
  }
};

export const LikeTrackIntentHandler = {
  canHandle: canHandleIntent('LikeTrackIntent'),
  async handle(handlerInput) {
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    const track = getTrackAt(queue);
    const userId = getUserId(handlerInput);
    await queueStore.unblockTrack(userId, track.ratingKey);
    await plex.rateTrack(track, 10);
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .speak(respond('liked', { title: track.title }))
      .getResponse();
  }
};

export const DislikeTrackIntentHandler = {
  canHandle: canHandleIntent('DislikeTrackIntent'),
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    const track = getTrackAt(queue);
    await queueStore.blockTrack(userId, track.ratingKey);
    try {
      await plex.rateTrack(track, 0);
    } catch (error) {
      console.warn('Plex thumbs-down rating failed after local block', { message: error.message });
      track.userRating = 0;
    }
    const nextIndex = findNextPlayableIndex(queue);
    const builder = handlerInput.responseBuilder.speak(respond('disliked', { title: track.title }));
    if (nextIndex != null) {
      moveTo(queue, nextIndex);
      builder.addDirective(await playDirective({ queue, position: queue.index, plex }));
    } else {
      builder.addDirective(stopDirective());
    }
    await queueStore.put(userId, queue);
    return builder.withShouldEndSession(true).getResponse();
  }
};

export const RateTrackIntentHandler = {
  canHandle: canHandleIntent('RateTrackIntent'),
  async handle(handlerInput) {
    const rating = Number(getSlotValue(handlerInput, 'rating'));
    if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
      return handlerInput.responseBuilder.speak(respond('invalidRating')).getResponse();
    }
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    const track = getTrackAt(queue);
    const userId = getUserId(handlerInput);
    if (rating === 0) await queueStore.blockTrack(userId, track.ratingKey);
    else await queueStore.unblockTrack(userId, track.ratingKey);
    const savedRating = await plex.rateTrack(track, rating);
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .speak(respond('rated', { title: track.title, rating: savedRating }))
      .getResponse();
  }
};

export const AddToPlaylistIntentHandler = {
  canHandle: canHandleIntent('AddToPlaylistIntent'),
  async handle(handlerInput) {
    const playlistName = getSlotValue(handlerInput, 'playlist');
    if (!playlistName) return handlerInput.responseBuilder.speak(respond('missingPlaylist')).getResponse();
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    const track = getTrackAt(queue);
    const result = await plex.addTrackToPlaylist(track, playlistName);
    if (!result.ok) {
      if (result.reason === 'disabled') {
        return handlerInput.responseBuilder.speak(respond('playlistWritesDisabled')).getResponse();
      }
      return handlerInput.responseBuilder
        .speak(respond('playlistMissing', { playlist: result.title || playlistName }))
        .getResponse();
    }
    return handlerInput.responseBuilder
      .speak(respond('playlistAdded', { title: track.title, playlist: result.title }))
      .getResponse();
  }
};

export const DiagnosticsIntentHandler = {
  canHandle: canHandleIntent('DiagnosticsIntent'),
  async handle(handlerInput) {
    const [health, queue] = await Promise.all([
      plex.healthCheck(),
      queueStore.get(getUserId(handlerInput))
    ]);
    const plexStatus = health.ok
      ? `online in ${health.latencyMs} milliseconds`
      : 'offline or refusing to cooperate';
    const lyricsStatus = config.lyricsMode === 'off' ? 'off' : config.lyricsMode.replace('-', ' plus ');
    const playlistStatus = config.allowPlaylistWrites ? 'enabled' : 'disabled';
    return handlerInput.responseBuilder
      .speak(respond('status', {
        plexStatus,
        queueCount: queue?.tracks?.length ?? 0,
        lyricsStatus,
        playlistStatus
      }))
      .getResponse();
  }
};
