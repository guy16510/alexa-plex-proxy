export function getUserId(handlerInput) {
  return handlerInput.requestEnvelope.context?.System?.user?.userId
    ?? handlerInput.requestEnvelope.session?.user?.userId;
}

export function getApplicationId(handlerInput) {
  return handlerInput.requestEnvelope.context?.System?.application?.applicationId
    ?? handlerInput.requestEnvelope.session?.application?.applicationId;
}

export function getSlotValue(handlerInput, name) {
  return handlerInput.requestEnvelope.request?.intent?.slots?.[name]?.value?.trim() || null;
}

export function isAudioPlayerRequest(handlerInput) {
  return handlerInput.requestEnvelope.request?.type?.startsWith('AudioPlayer.') ?? false;
}
