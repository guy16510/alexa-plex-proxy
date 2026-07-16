import Alexa from 'ask-sdk-core';
import { getUserId } from './request-utils.js';
import { queueStore } from './runtime.js';

export function canHandleIntent(name) {
  return (handlerInput) =>
    Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(handlerInput.requestEnvelope) === name;
}

export function emptyResponse(handlerInput) {
  return handlerInput.responseBuilder.getResponse();
}

export async function getQueueOrSpeak(handlerInput) {
  const queue = await queueStore.get(getUserId(handlerInput));
  if (!queue || !queue.tracks?.length) {
    return {
      queue: null,
      response: handlerInput.responseBuilder
        .speak('There is nothing queued. Ask Plex Music to play an artist, song, album, or playlist.')
        .getResponse()
    };
  }
  return { queue, response: null };
}
