import Alexa from 'ask-sdk-core';
import { loadConfig } from './config.js';
import { GatewayClient } from './gateway-client.js';
import {
  createQueue,
  getNextIndex,
  getPreviousIndex,
  getTrackAt,
  moveTo,
  parseToken,
  setShuffle
  ,tokenMatchesQueue
} from './queue.js';
import { QueueStore } from './queue-store.js';
import { playDirective, stopDirective } from './playback.js';
import {
  getApplicationId,
  getSlotValue,
  getUserId,
  isAudioPlayerRequest
} from './request-utils.js';

const config = loadConfig();
const gateway = new GatewayClient({
  baseUrl: config.gatewayBaseUrl,
  apiKey: config.gatewayApiKey
});
const queueStore = new QueueStore({ tableName: config.queueTable });

function canHandleIntent(name) {
  return (handlerInput) =>
    Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(handlerInput.requestEnvelope) === name;
}

function emptyResponse(handlerInput) {
  return handlerInput.responseBuilder.getResponse();
}

function mediaKindForIntent(intentName) {
  return {
    PlaySongIntent: 'track',
    PlayArtistIntent: 'artist',
    PlayAlbumIntent: 'album',
    PlayPlaylistIntent: 'playlist',
    PlayAnyIntent: 'any'
  }[intentName] ?? 'any';
}

async function getQueueOrSpeak(handlerInput) {
  const queue = await queueStore.get(getUserId(handlerInput));
  if (!queue || queue.tracks?.length === 0) {
    return {
      queue: null,
      response: handlerInput.responseBuilder
        .speak('There is nothing queued. Ask Plex Music to play an artist, song, album, or playlist.')
        .getResponse()
    };
  }
  return { queue, response: null };
}

const ValidateApplicationIdInterceptor = {
  process(handlerInput) {
    if (!config.alexaSkillId) return;
    const applicationId = getApplicationId(handlerInput);
    if (applicationId !== config.alexaSkillId) {
      throw new Error('Alexa Skill ID mismatch');
    }
  }
};

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Plex Music is ready. Say play Queen, play the album The Wall, or play the song Everlong.')
      .reprompt('What should I play from Plex?')
      .getResponse();
  }
};

const PlayMediaIntentHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
    return [
      'PlaySongIntent',
      'PlayArtistIntent',
      'PlayAlbumIntent',
      'PlayPlaylistIntent',
      'PlayAnyIntent'
    ].includes(Alexa.getIntentName(handlerInput.requestEnvelope));
  },
  async handle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const kind = mediaKindForIntent(intentName);
    const query = getSlotValue(handlerInput, 'query');

    if (!query) {
      return handlerInput.responseBuilder
        .speak('I did not catch what you wanted to play.')
        .reprompt('Try saying, play songs by Queen.')
        .getResponse();
    }

    const result = await gateway.resolve({ kind, query });
    if (!result?.tracks?.length) {
      return handlerInput.responseBuilder
        .speak(`I could not find ${query} in your Plex music library.`)
        .getResponse();
    }

    const tracks = result.tracks.slice(0, config.maxQueueTracks);
    const queue = createQueue(tracks);
    await queueStore.put(getUserId(handlerInput), queue);

    return handlerInput.responseBuilder
      .speak(`Playing ${result.title} from Plex.`)
      .addDirective(playDirective(queue, 0, config))
      .withShouldEndSession(true)
      .getResponse();
  }
};

const PauseIntentHandler = {
  canHandle: canHandleIntent('AMAZON.PauseIntent'),
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .addDirective(stopDirective())
      .withShouldEndSession(true)
      .getResponse();
  }
};

const ResumeIntentHandler = {
  canHandle: canHandleIntent('AMAZON.ResumeIntent'),
  async handle(handlerInput) {
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;

    return handlerInput.responseBuilder
      .addDirective(playDirective(queue, queue.index, config))
      .withShouldEndSession(true)
      .getResponse();
  }
};

const NextIntentHandler = {
  canHandle: canHandleIntent('AMAZON.NextIntent'),
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;

    const nextIndex = getNextIndex(queue);
    if (nextIndex == null) {
      return handlerInput.responseBuilder.speak('That was the last track.').getResponse();
    }

    moveTo(queue, nextIndex);
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .addDirective(playDirective(queue, queue.index, config))
      .withShouldEndSession(true)
      .getResponse();
  }
};

const PreviousIntentHandler = {
  canHandle: canHandleIntent('AMAZON.PreviousIntent'),
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;

    const previousIndex = getPreviousIndex(queue);
    if (previousIndex == null) {
      return handlerInput.responseBuilder.speak('That is the first track.').getResponse();
    }

    moveTo(queue, previousIndex);
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .addDirective(playDirective(queue, queue.index, config))
      .withShouldEndSession(true)
      .getResponse();
  }
};

const StartOverIntentHandler = {
  canHandle: canHandleIntent('AMAZON.StartOverIntent'),
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;

    queue.offsetMs = 0;
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .addDirective(playDirective(queue, queue.index, config))
      .withShouldEndSession(true)
      .getResponse();
  }
};

const ShuffleOnIntentHandler = {
  canHandle: canHandleIntent('AMAZON.ShuffleOnIntent'),
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;

    setShuffle(queue, true);
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .speak('Shuffle is on.')
      .addDirective(playDirective(queue, queue.index, config))
      .withShouldEndSession(true)
      .getResponse();
  }
};

const ShuffleOffIntentHandler = {
  canHandle: canHandleIntent('AMAZON.ShuffleOffIntent'),
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;

    setShuffle(queue, false);
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .speak('Shuffle is off.')
      .addDirective(playDirective(queue, queue.index, config))
      .withShouldEndSession(true)
      .getResponse();
  }
};

const LoopOnIntentHandler = {
  canHandle: canHandleIntent('AMAZON.LoopOnIntent'),
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    queue.loop = true;
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder.speak('Loop is on.').getResponse();
  }
};

const LoopOffIntentHandler = {
  canHandle: canHandleIntent('AMAZON.LoopOffIntent'),
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    queue.loop = false;
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder.speak('Loop is off.').getResponse();
  }
};

const NowPlayingIntentHandler = {
  canHandle: canHandleIntent('NowPlayingIntent'),
  async handle(handlerInput) {
    const { queue, response } = await getQueueOrSpeak(handlerInput);
    if (response) return response;
    const track = getTrackAt(queue);
    return handlerInput.responseBuilder
      .speak(`This is ${track.title} by ${track.artist}, from the album ${track.album}.`)
      .getResponse();
  }
};

const StopIntentHandler = {
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

const HelpIntentHandler = {
  canHandle: canHandleIntent('AMAZON.HelpIntent'),
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Say, play songs by Queen, play the album The Wall, or play the song Everlong.')
      .reprompt('What should I play?')
      .getResponse();
  }
};

const FallbackIntentHandler = {
  canHandle: canHandleIntent('AMAZON.FallbackIntent'),
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('I can play an artist, album, song, or Plex playlist.')
      .reprompt('Try saying, play songs by Queen.')
      .getResponse();
  }
};

const PlaybackStartedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackStarted';
  },
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const queue = await queueStore.get(userId);
    const parsed = parseToken(handlerInput.requestEnvelope.request.token);
    if (queue && tokenMatchesQueue(queue, handlerInput.requestEnvelope.request.token) && moveTo(queue, parsed.position)) {
      queue.offsetMs = handlerInput.requestEnvelope.request.offsetInMilliseconds ?? 0;
      await queueStore.put(userId, queue);
    }
    return emptyResponse(handlerInput);
  }
};

const PlaybackStoppedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackStopped';
  },
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const queue = await queueStore.get(userId);
    const parsed = parseToken(handlerInput.requestEnvelope.request.token);
    if (queue && tokenMatchesQueue(queue, handlerInput.requestEnvelope.request.token)) {
      queue.index = parsed.position;
      queue.offsetMs = handlerInput.requestEnvelope.request.offsetInMilliseconds ?? 0;
      queue.enqueuedIndex = null;
      await queueStore.put(userId, queue);
    }
    return emptyResponse(handlerInput);
  }
};

const PlaybackNearlyFinishedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackNearlyFinished';
  },
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const queue = await queueStore.get(userId);
    const currentToken = handlerInput.requestEnvelope.request.token;
    const parsed = parseToken(currentToken);

    if (!queue || !tokenMatchesQueue(queue, currentToken)) return emptyResponse(handlerInput);
    if (queue.enqueuedIndex != null) return emptyResponse(handlerInput);

    const nextIndex = getNextIndex(queue, parsed.position);
    if (nextIndex == null) return emptyResponse(handlerInput);

    queue.enqueuedIndex = nextIndex;
    await queueStore.put(userId, queue);
    return handlerInput.responseBuilder
      .addDirective(playDirective(queue, nextIndex, config, 'ENQUEUE', currentToken))
      .getResponse();
  }
};

const PlaybackFinishedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackFinished';
  },
  handle(handlerInput) {
    return emptyResponse(handlerInput);
  }
};

const PlaybackFailedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackFailed';
  },
  async handle(handlerInput) {
    const userId = getUserId(handlerInput);
    const queue = await queueStore.get(userId);
    const token = handlerInput.requestEnvelope.request.token;
    if (!queue || !tokenMatchesQueue(queue, token)) return emptyResponse(handlerInput);

    const attempts = queue.retryCounts?.[token] ?? 0;
    queue.retryCounts ??= {};
    if (attempts < 1) {
      queue.retryCounts[token] = attempts + 1;
      await queueStore.put(userId, queue);
      return handlerInput.responseBuilder
        .addDirective(playDirective(queue, queue.index, config))
        .getResponse();
    }

    const nextIndex = getNextIndex(queue);
    if (nextIndex != null) {
      moveTo(queue, nextIndex);
      await queueStore.put(userId, queue);
      return handlerInput.responseBuilder
        .addDirective(playDirective(queue, queue.index, config))
        .getResponse();
    }
    await queueStore.put(userId, queue);
    return emptyResponse(handlerInput);
  }
};

const SessionEndedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    return emptyResponse(handlerInput);
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error('Alexa skill request failed', error);
    if (isAudioPlayerRequest(handlerInput)) return emptyResponse(handlerInput);
    return handlerInput.responseBuilder
      .speak('Plex Music hit an error. Check the Lambda and gateway logs.')
      .getResponse();
  }
};

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
