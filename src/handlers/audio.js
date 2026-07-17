import Alexa from 'ask-sdk-core';
import { emptyResponse } from '../handler-utils.js';
import { playDirective } from '../playback.js';
import {
  getNextIndex,
  getTrackAt,
  moveTo,
  parseToken,
  tokenMatchesQueue
} from '../queue.js';
import { getUserId } from '../request-utils.js';
import { plex, queueStore } from '../runtime.js';

export const PlaybackStartedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackStarted';
  },
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const queue = await queueStore.get(userId);
    const token = handlerInput.requestEnvelope.request.token;
    const parsed = parseToken(token);
    if (queue && parsed && tokenMatchesQueue(queue, token) && moveTo(queue, parsed.position)) {
      queue.offsetMs = handlerInput.requestEnvelope.request.offsetInMilliseconds ?? 0;
      queue.enqueuedIndex = null;
      queue.retryCounts[token] = 0;
      await queueStore.put(userId, queue);
      await plex.reportPlayback(getTrackAt(queue), 'playing', queue.offsetMs);
    }
    return emptyResponse(handlerInput);
  }
};

export const PlaybackStoppedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackStopped';
  },
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const queue = await queueStore.get(userId);
    const token = handlerInput.requestEnvelope.request.token;
    const parsed = parseToken(token);
    if (queue && parsed && tokenMatchesQueue(queue, token)) {
      queue.index = parsed.position;
      queue.offsetMs = handlerInput.requestEnvelope.request.offsetInMilliseconds ?? 0;
      queue.enqueuedIndex = null;
      await queueStore.put(userId, queue);
      await plex.reportPlayback(getTrackAt(queue), 'paused', queue.offsetMs);
    }
    return emptyResponse(handlerInput);
  }
};

export const PlaybackNearlyFinishedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackNearlyFinished';
  },
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const queue = await queueStore.get(userId);
    const currentToken = handlerInput.requestEnvelope.request.token;
    const parsed = parseToken(currentToken);
    if (!queue || !parsed || !tokenMatchesQueue(queue, currentToken)) return emptyResponse(handlerInput);

    const nextIndex = getNextIndex(queue, parsed.position);
    if (nextIndex == null || queue.enqueuedIndex === nextIndex) return emptyResponse(handlerInput);

    queue.enqueuedIndex = nextIndex;
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .addDirective(await playDirective({
        queue,
        position: nextIndex,
        plex,
        behavior: 'ENQUEUE',
        expectedPreviousToken: currentToken,
        offsetMs: 0
      }))
      .getResponse();
  }
};

export const PlaybackFinishedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackFinished';
  },
  handle(handlerInput) {
    return emptyResponse(handlerInput);
  }
};

export const PlaybackFailedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackFailed';
  },
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const queue = await queueStore.get(userId);
    const token = handlerInput.requestEnvelope.request.token;
    const parsed = parseToken(token);
    if (!queue || !parsed || !tokenMatchesQueue(queue, token)) return emptyResponse(handlerInput);

    queue.retryCounts ??= {};
    const attempts = queue.retryCounts[token] ?? 0;
    if (attempts < 1) {
      queue.retryCounts[token] = attempts + 1;
      queue.index = parsed.position;
      queue.enqueuedIndex = null;
      await queueStore.put(userId, queue);
      return handlerInput.responseBuilder
        .addDirective(await playDirective({ queue, position: parsed.position, plex, offsetMs: 0 }))
        .getResponse();
    }

    const nextIndex = getNextIndex(queue, parsed.position);
    if (nextIndex != null) {
      moveTo(queue, nextIndex);
      await queueStore.put(userId, queue);
      return handlerInput.responseBuilder
        .addDirective(await playDirective({ queue, position: nextIndex, plex, offsetMs: 0 }))
        .getResponse();
    }

    await queueStore.put(userId, queue);
    return emptyResponse(handlerInput);
  }
};
