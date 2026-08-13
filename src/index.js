import Alexa from 'ask-sdk-core';
import {
  AddToPlaylistIntentHandler,
  DiagnosticsIntentHandler,
  DislikeTrackIntentHandler,
  LikeTrackIntentHandler,
  LoopOffIntentHandler,
  LoopOnIntentHandler,
  NextIntentHandler,
  NowPlayingIntentHandler,
  PauseIntentHandler,
  PlayDecadeIntentHandler,
  PlayGenreIntentHandler,
  PlayMediaIntentHandler,
  PlayRadioIntentHandler,
  PreviousIntentHandler,
  RateTrackIntentHandler,
  ResumeIntentHandler,
  SeekBackwardIntentHandler,
  SeekForwardIntentHandler,
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
  PlaybackControllerNextHandler,
  PlaybackControllerPauseHandler,
  PlaybackControllerPlayHandler,
  PlaybackControllerPreviousHandler
} from './handlers/playback-controller.js';
import {
  ErrorHandler,
  FallbackIntentHandler,
  HelpIntentHandler,
  LaunchRequestHandler,
  SessionEndedHandler,
  StopIntentHandler,
  SystemExceptionEncounteredHandler,
  ValidateApplicationIdInterceptor
} from './handlers/system.js';
import { VisualMotionResponseInterceptor } from './apl-motion.js';
import {
  RequestTelemetryInterceptor,
  ResponseTelemetryInterceptor,
  instrumentHandler
} from './request-telemetry.js';
import {
  AplUserEventHandler,
  ShowHomeIntentHandler,
  ShowLyricsIntentHandler,
  ShowQueueIntentHandler,
  VisualLaunchRequestHandler,
  VisualPlayMediaIntentHandler
} from './visual-experience.js';

const named = (name, requestHandler) => instrumentHandler(name, requestHandler);
const handlerCatalog = {
  VisualLaunchRequestHandler, LaunchRequestHandler, VisualPlayMediaIntentHandler,
  PlayMediaIntentHandler, ShowHomeIntentHandler, ShowQueueIntentHandler,
  ShowLyricsIntentHandler, PlayGenreIntentHandler, PlayDecadeIntentHandler,
  PlayRadioIntentHandler, PauseIntentHandler, ResumeIntentHandler, NextIntentHandler,
  PreviousIntentHandler, StartOverIntentHandler, SeekForwardIntentHandler,
  SeekBackwardIntentHandler, ShuffleOnIntentHandler, ShuffleOffIntentHandler,
  LoopOnIntentHandler, LoopOffIntentHandler, NowPlayingIntentHandler,
  LikeTrackIntentHandler, DislikeTrackIntentHandler, RateTrackIntentHandler,
  AddToPlaylistIntentHandler, DiagnosticsIntentHandler, StopIntentHandler,
  HelpIntentHandler, AplUserEventHandler, FallbackIntentHandler,
  PlaybackControllerNextHandler, PlaybackControllerPreviousHandler,
  PlaybackControllerPauseHandler, PlaybackControllerPlayHandler, PlaybackStartedHandler,
  PlaybackStoppedHandler, PlaybackNearlyFinishedHandler, PlaybackFinishedHandler,
  PlaybackFailedHandler, SystemExceptionEncounteredHandler, SessionEndedHandler
};
const instrumentedHandlers = Object.entries(handlerCatalog)
  .map(([name, requestHandler]) => named(name, requestHandler));

export const handler = Alexa.SkillBuilders.custom()
  .addRequestInterceptors(RequestTelemetryInterceptor, ValidateApplicationIdInterceptor)
  .addResponseInterceptors(VisualMotionResponseInterceptor, ResponseTelemetryInterceptor)
  .addRequestHandlers(...instrumentedHandlers)
  .addErrorHandlers(ErrorHandler)
  .lambda();
