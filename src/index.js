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
  ValidateApplicationIdInterceptor
} from './handlers/system.js';

export const handler = Alexa.SkillBuilders.custom()
  .addRequestInterceptors(ValidateApplicationIdInterceptor)
  .addRequestHandlers(
    LaunchRequestHandler,
    PlayMediaIntentHandler,
    PlayGenreIntentHandler,
    PlayDecadeIntentHandler,
    PlayRadioIntentHandler,
    PauseIntentHandler,
    ResumeIntentHandler,
    NextIntentHandler,
    PreviousIntentHandler,
    StartOverIntentHandler,
    SeekForwardIntentHandler,
    SeekBackwardIntentHandler,
    ShuffleOnIntentHandler,
    ShuffleOffIntentHandler,
    LoopOnIntentHandler,
    LoopOffIntentHandler,
    NowPlayingIntentHandler,
    LikeTrackIntentHandler,
    DislikeTrackIntentHandler,
    RateTrackIntentHandler,
    AddToPlaylistIntentHandler,
    DiagnosticsIntentHandler,
    StopIntentHandler,
    HelpIntentHandler,
    FallbackIntentHandler,
    PlaybackControllerNextHandler,
    PlaybackControllerPreviousHandler,
    PlaybackControllerPauseHandler,
    PlaybackControllerPlayHandler,
    PlaybackStartedHandler,
    PlaybackStoppedHandler,
    PlaybackNearlyFinishedHandler,
    PlaybackFinishedHandler,
    PlaybackFailedHandler,
    SessionEndedHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
