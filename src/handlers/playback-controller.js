import Alexa from 'ask-sdk-core';
import { emptyResponse } from '../handler-utils.js';
import { playDirective, stopDirective } from '../playback.js';
import { getNextIndex, getPreviousIndex, moveTo } from '../queue.js';
import { getUserId } from '../request-utils.js';
import { plex, queueStore } from '../runtime.js';

function canHandleRequest(requestType) {
  return (handlerInput) => Alexa.getRequestType(handlerInput.requestEnvelope) === requestType;
}

async function moveAndPlay(handlerInput, direction) {
  const userId = getUserId(handlerInput);
  const queue = await queueStore.get(userId);
  if (!queue?.tracks?.length) return emptyResponse(handlerInput);

  const position = direction === 'next' ? getNextIndex(queue) : getPreviousIndex(queue);
  if (position == null || !moveTo(queue, position)) return emptyResponse(handlerInput);

  await queueStore.put(userId, queue);
  return handlerInput.responseBuilder
    .addDirective(await playDirective({ queue, position: queue.index, plex }))
    .getResponse();
}

export const PlaybackControllerNextHandler = {
  canHandle: canHandleRequest('PlaybackController.NextCommandIssued'),
  handle(handlerInput) {
    return moveAndPlay(handlerInput, 'next');
  }
};

export const PlaybackControllerPreviousHandler = {
  canHandle: canHandleRequest('PlaybackController.PreviousCommandIssued'),
  handle(handlerInput) {
    return moveAndPlay(handlerInput, 'previous');
  }
};

export const PlaybackControllerPauseHandler = {
  canHandle: canHandleRequest('PlaybackController.PauseCommandIssued'),
  handle(handlerInput) {
    return handlerInput.responseBuilder.addDirective(stopDirective()).getResponse();
  }
};

export const PlaybackControllerPlayHandler = {
  canHandle: canHandleRequest('PlaybackController.PlayCommandIssued'),
  async handle(handlerInput) {
    const queue = await queueStore.get(getUserId(handlerInput));
    if (!queue?.tracks?.length) return emptyResponse(handlerInput);
    return handlerInput.responseBuilder
      .addDirective(await playDirective({ queue, position: queue.index, plex }))
      .getResponse();
  }
};
