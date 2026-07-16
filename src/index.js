import Alexa from 'ask-sdk-core';
import {
  LoopOffIntentHandler,
  LoopOnIntentHandler,
  NextIntentHandler,
  NowPlayingIntentHandler,
  PauseIntentHandler,
  PlayMediaIntentHandler,
  PreviousIntentHandler,
  ResumeIntentHandler,
  ShuffleOffIntentHandler,
  ShuffleOnIntentHandler,
  StartOverIntentHandler
} from './handlers/intents.js';
import {
  PlaybackFailedHandler,
  PlaybackFinishedHandler,
  PlaybackNearlyFinishedHandler,
  PlaybackStartedHandler,
  PlaybackStoppedHandler
} from './handlers/audio.js';
import {
  ErrorHandler,
  FallbackIntentHandler,
  HelpIntentHandler,
  LaunchRequestHandler,
  SessionEndedHandler,
  StopIntentHandler,
  ValidateApplicationIdInterceptor
} from './handlers/system.js';

export const handler = Alexa.SkillBuilders.custom()
  .addRequestInterceptors(ValidateApplicationIdInterceptor)
  .addRequestHandlers(
    LaunchRequestHandler,
    PlayMediaIntentHandler,
    PauseIntentHandler,
    ResumeIntentHandler,
    NextIntentHandler,
    PreviousIntentHandler,
    StartOverIntentHandler,
    ShuffleOnIntentHandler,
    ShuffleOffIntentHandler,
    LoopOnIntentHandler,
    LoopOffIntentHandler,
    NowPlayingIntentHandler,
    StopIntentHandler,
    HelpIntentHandler,
    FallbackIntentHandler,
    PlaybackStartedHandler,
    PlaybackStoppedHandler,
    PlaybackNearlyFinishedHandler,
    PlaybackFinishedHandler,
    PlaybackFailedHandler,
    SessionEndedHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
