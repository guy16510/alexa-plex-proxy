import Alexa from 'ask-sdk-core';
import { getUserId } from './request-utils.js';
import { queueStore, respond } from './runtime.js';

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
        .speak(respond('emptyQueue'))
        .getResponse()
    };
  }
  return { queue, response: null };
}
