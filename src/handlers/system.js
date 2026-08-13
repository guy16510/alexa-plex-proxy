import Alexa from 'ask-sdk-core';
import { canHandleIntent, emptyResponse } from '../handler-utils.js';
import { stopDirective } from '../playback.js';
import { getApplicationId, isPlaybackOnlyRequest } from '../request-utils.js';
import { config, respond } from '../runtime.js';
import { redactPlexSecrets } from '../plex-client.js';
import { RequestDeadlineExceededError } from '../request-deadline.js';
import { recordRequestError, setApplicationIdValidation } from '../request-telemetry.js';

export const ValidateApplicationIdInterceptor = {
  process(handlerInput) {
    const valid = getApplicationId(handlerInput) === config.alexaSkillId;
    setApplicationIdValidation(handlerInput, valid);
    if (!valid) {
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
      .speak(respond('launch'))
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
      .speak(respond('stopped'))
      .addDirective(stopDirective())
      .withShouldEndSession(true)
      .getResponse();
  }
};

export const HelpIntentHandler = {
  canHandle: canHandleIntent('AMAZON.HelpIntent'),
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(respond('help'))
      .reprompt('What should I play?')
      .getResponse();
  }
};

export const FallbackIntentHandler = {
  canHandle: canHandleIntent('AMAZON.FallbackIntent'),
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(respond('fallback'))
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

export const SystemExceptionEncounteredHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'System.ExceptionEncountered';
  },
  handle(handlerInput) {
    const request = handlerInput.requestEnvelope?.request ?? {};
    console.error('Alexa rejected a skill response', {
      requestId: request.requestId,
      causeRequestId: request.cause?.requestId,
      errorType: request.error?.type,
      message: redactPlexSecrets(String(request.error?.message ?? 'unknown'))
    });
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
    let response;
    if (isPlaybackOnlyRequest(handlerInput)) response = emptyResponse(handlerInput);
    else response = handlerInput.responseBuilder
      .speak(error instanceof RequestDeadlineExceededError
        ? 'Plex is taking too long right now. Try again in a moment.'
        : respond('error'))
      .getResponse();
    recordRequestError(handlerInput, error, response);
    return response;
  }
};
