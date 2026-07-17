import Alexa from 'ask-sdk-core';
import { canHandleIntent, emptyResponse } from '../handler-utils.js';
import { stopDirective } from '../playback.js';
import { getApplicationId, isAudioPlayerRequest } from '../request-utils.js';
import { config } from '../runtime.js';
import { redactPlexSecrets } from '../plex-client.js';

export const ValidateApplicationIdInterceptor = {
  process(handlerInput) {
    if (getApplicationId(handlerInput) !== config.alexaSkillId) {
      throw new Error('Alexa Skill ID mismatch');
    }
  }
};

export const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Server Music is ready. Say play Queen, play the album The Wall, or play the song Everlong.')
      .reprompt('What should I play from Plex?')
      .getResponse();
  }
};

export const StopIntentHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
    return ['AMAZON.StopIntent', 'AMAZON.CancelIntent'].includes(
      Alexa.getIntentName(handlerInput.requestEnvelope)
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .addDirective(stopDirective())
      .withShouldEndSession(true)
      .getResponse();
  }
};

export const HelpIntentHandler = {
  canHandle: canHandleIntent('AMAZON.HelpIntent'),
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Say, play songs by Queen, play the album The Wall, or play the song Everlong.')
      .reprompt('What should I play?')
      .getResponse();
  }
};

export const FallbackIntentHandler = {
  canHandle: canHandleIntent('AMAZON.FallbackIntent'),
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('I can play an artist, album, song, or Plex playlist.')
      .reprompt('Try saying, play songs by Queen.')
      .getResponse();
  }
};

export const SessionEndedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    return emptyResponse(handlerInput);
  }
};

export const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error('Alexa skill request failed', {
      name: error.name,
      message: redactPlexSecrets(error.message),
      requestType: Alexa.getRequestType(handlerInput.requestEnvelope)
    });
    if (isAudioPlayerRequest(handlerInput)) return emptyResponse(handlerInput);
    return handlerInput.responseBuilder
      .speak('Server Music hit an error. Check the Lambda logs and Plex remote access.')
      .getResponse();
  }
};
