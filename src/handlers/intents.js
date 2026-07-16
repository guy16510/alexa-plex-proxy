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
import { config, plex, queueStore } from '../runtime.js';

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
        .speak('I did not catch what you wanted to play.')
        .reprompt('Try saying, play songs by Queen.')
        .getResponse();
    }

    const result = await plex.resolve(kind, query);
    if (!result?.tracks?.length) {
      return handlerInput.responseBuilder
        .speak(`I could not find ${query} in your Plex music library.`)
        .getResponse();
    }

    const queue = createQueue(result.tracks.slice(0, config.maxQueueTracks), {
      sourceTitle: result.title,
      sourceKind: result.kind,
      ttlHours: config.queueTtlHours
    });
    if (shuffle) setShuffle(queue, true);
    await queueStore.put(getUserId(handlerInput), queue);

    return handlerInput.responseBuilder
      .speak(`${shuffle ? 'Shuffling' : 'Playing'} ${result.title} from Plex.`)
      .addDirective(playDirective({ queue, position: queue.index, plex }))
      .withShouldEndSession(true)
      .getResponse();
  }
};

export const PauseIntentHandler = {
  canHandle: canHandleIntent('AMAZON.PauseIntent'),
  handle(handlerInput) {
    return handlerInput.responseBuilder
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
      .addDirective(playDirective({ queue, position: queue.index, plex }))
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
    if (nextIndex == null) return handlerInput.responseBuilder.speak('That was the last track.').getResponse();
    moveTo(queue, nextIndex);
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .addDirective(playDirective({ queue, position: queue.index, plex }))
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
    if (previousIndex == null) return handlerInput.responseBuilder.speak('That is the first track.').getResponse();
    moveTo(queue, previousIndex);
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .addDirective(playDirective({ queue, position: queue.index, plex }))
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
      .addDirective(playDirective({ queue, position: queue.index, plex, offsetMs: 0 }))
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
      .speak('Shuffle is on.')
      .addDirective(playDirective({ queue, position: queue.index, plex }))
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
      .speak('Shuffle is off.')
      .addDirective(playDirective({ queue, position: queue.index, plex }))
      .withShouldEndSession(true)
      .getResponse();
  }
};

function toggleQueueSetting(intentName, property, value, speech) {
  return {
    canHandle: canHandleIntent(intentName),
    async handle(handlerInput) {
      const userId = getUserId(handlerInput);
      const { queue, response } = await getQueueOrSpeak(handlerInput);
      if (response) return response;
      queue[property] = value;
      await queueStore.put(userId, queue);
      return handlerInput.responseBuilder.speak(speech).getResponse();
    }
  };
}

export const LoopOnIntentHandler = toggleQueueSetting('AMAZON.LoopOnIntent', 'loop', true, 'Loop is on.');
export const LoopOffIntentHandler = toggleQueueSetting('AMAZON.LoopOffIntent', 'loop', false, 'Loop is off.');

export const NowPlayingIntentHandler = {
  canHandle: canHandleIntent('NowPlayingIntent'),
  async handle(handlerInput) {
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    const track = getTrackAt(queue);
    return handlerInput.responseBuilder
      .speak(`This is ${track.title} by ${track.artist}, from the album ${track.album}.`)
      .getResponse();
  }
};
