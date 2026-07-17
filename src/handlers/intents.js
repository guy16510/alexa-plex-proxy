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
  if (!result?.tracks?.length) {
    return handlerInput.responseBuilder
      .speak(respond('notFound', { query }))
      .getResponse();
  }

  const queue = createQueue(result.tracks.slice(0, config.maxQueueTracks), {
    sourceTitle: result.title,
    sourceKind: result.kind,
    ttlHours: config.queueTtlHours
  });
  if (shuffle) {
    moveTo(queue, Math.floor(Math.random() * queue.tracks.length));
    setShuffle(queue, true);
  }
  await queueStore.put(getUserId(handlerInput), queue);

  const key = speechKey ?? (shuffle ? 'shuffling' : 'playing');
  return handlerInput.responseBuilder
    .speak(respond(key, { title: result.title }))
    .addDirective(await playDirective({ queue, position: queue.index, plex }))
    .withShouldEndSession(true)
    .getResponse();
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
        .speak('I did not catch what you wanted to play. The microphones are apparently unionizing.')
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
    if (!genre) return handlerInput.responseBuilder.speak('Which genre should I play?').getResponse();
    const result = await plex.resolveGenre(genre);
    return playResult(handlerInput, result, { shuffle: true, spokenTitle: genre });
  }
};

export const PlayDecadeIntentHandler = {
  canHandle: canHandleIntent('PlayDecadeIntent'),
  async handle(handlerInput) {
    const decade = getSlotValue(handlerInput, 'decade');
    if (!decade) return handlerInput.responseBuilder.speak('Which decade should I rummage through?').getResponse();
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
      .addDirective(await playDirective({ queue, position: queue.index, plex }))
      .withShouldEndSession(true)
      .getResponse();
  }
};

export const NextIntentHandler = {
  canHandle: canHandleIntent('AMAZON.NextIntent'),
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    const nextIndex = getNextIndex(queue);
    if (nextIndex == null) return handlerInput.responseBuilder.speak('That was the last track. The queue has nothing left to give.').getResponse();
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
    if (previousIndex == null) return handlerInput.responseBuilder.speak('That is the first track. Time itself refuses to go back any further.').getResponse();
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
    queue.enqueuedIndex = null;
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .speak(respond('startOver'))
      .addDirective(await playDirective({ queue, position: queue.index, plex, offsetMs: 0 }))
      .withShouldEndSession(true)
      .getResponse();
  }
};

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
    return handlerInput.responseBuilder
      .speak(respond('nowPlaying', track))
      .getResponse();
  }
};

export const LikeTrackIntentHandler = {
  canHandle: canHandleIntent('LikeTrackIntent'),
  async handle(handlerInput) {
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    const track = getTrackAt(queue);
    await plex.rateTrack(track, 10);
    await queueStore.put(getUserId(handlerInput), queue);
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
    await plex.rateTrack(track, 0);
    const nextIndex = getNextIndex(queue);
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
      return handlerInput.responseBuilder.speak('Give me a rating from zero to ten. I can judge, but I cannot violate basic arithmetic.').getResponse();
    }
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    const track = getTrackAt(queue);
    const savedRating = await plex.rateTrack(track, rating);
    await queueStore.put(getUserId(handlerInput), queue);
    return handlerInput.responseBuilder
      .speak(respond('rated', { title: track.title, rating: savedRating }))
      .getResponse();
  }
};

export const AddToPlaylistIntentHandler = {
  canHandle: canHandleIntent('AddToPlaylistIntent'),
  async handle(handlerInput) {
    const playlistName = getSlotValue(handlerInput, 'playlist');
    if (!playlistName) return handlerInput.responseBuilder.speak('Which playlist should receive this irresistible little number?').getResponse();
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    const track = getTrackAt(queue);
    const result = await plex.addTrackToPlaylist(track, playlistName);
    if (!result.ok) {
      if (result.reason === 'disabled') {
        return handlerInput.responseBuilder.speak('Playlist writes are disabled. The jukebox has been fitted with a chastity belt.').getResponse();
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
