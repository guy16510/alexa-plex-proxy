import Alexa from 'ask-sdk-core';

export function getSlotValue(handlerInput, slotName) {
  const slot = Alexa.getSlot(handlerInput.requestEnvelope, slotName);
  return slot?.value?.trim() || null;
}

export function getUserId(handlerInput) {
  return handlerInput.requestEnvelope.context?.System?.user?.userId
    ?? handlerInput.requestEnvelope.session?.user?.userId
    ?? 'anonymous';
}

export function getApplicationId(handlerInput) {
  return handlerInput.requestEnvelope.context?.System?.application?.applicationId
    ?? handlerInput.requestEnvelope.session?.application?.applicationId
    ?? null;
}

export function getAudioPlayerState(handlerInput) {
  return handlerInput.requestEnvelope.context?.AudioPlayer ?? null;
}

export function isAudioPlayerRequest(handlerInput) {
  return Alexa.getRequestType(handlerInput.requestEnvelope).startsWith('AudioPlayer.');
}

export function isPlaybackControllerRequest(handlerInput) {
  return Alexa.getRequestType(handlerInput.requestEnvelope).startsWith('PlaybackController.');
}

export function isPlaybackOnlyRequest(handlerInput) {
  return isAudioPlayerRequest(handlerInput) || isPlaybackControllerRequest(handlerInput);
}
