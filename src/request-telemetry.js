import Alexa from 'ask-sdk-core';
import { redactPlexSecrets } from './plex-client.js';

const stateByInput = new WeakMap();

function stateFor(handlerInput) {
  let state = stateByInput.get(handlerInput);
  if (!state) {
    state = { startedAt: performance.now(), applicationIdValid: null, handlerSelected: 'unselected' };
    stateByInput.set(handlerInput, state);
  }
  return state;
}

function deviceDetails(envelope = {}) {
  const device = envelope.context?.System?.device ?? {};
  const viewport = envelope.context?.Viewport ?? null;
  const id = String(device.deviceId ?? '');
  return {
    deviceIdSuffix: id ? id.slice(-8) : 'unknown',
    supportedInterfaces: Object.keys(device.supportedInterfaces ?? {}).sort(),
    viewport: viewport ? {
      pixelWidth: viewport.pixelWidth ?? null,
      pixelHeight: viewport.pixelHeight ?? null,
      shape: viewport.shape ?? null,
      dpi: viewport.dpi ?? null
    } : null
  };
}

function requestDetails(handlerInput) {
  const envelope = handlerInput.requestEnvelope ?? {};
  const request = envelope.request ?? {};
  let intentName = null;
  try {
    if (request.type === 'IntentRequest') intentName = Alexa.getIntentName(envelope);
  } catch {}
  return {
    requestId: request.requestId ?? 'unknown',
    requestType: request.type ?? 'unknown',
    intentName,
    timestamp: request.timestamp ?? null,
    sessionState: envelope.session?.new === true ? 'new' : 'existing',
    ...deviceDetails(envelope)
  };
}

function safeError(error) {
  if (!error) return null;
  return {
    name: error.name ?? 'Error',
    message: redactPlexSecrets(String(error.message ?? error))
  };
}

function emit(handlerInput, response, error = null) {
  const state = stateFor(handlerInput);
  if (state.emitted) return;
  state.emitted = true;
  const request = requestDetails(handlerInput);
  const latencyMs = Math.max(0, Math.round((performance.now() - state.startedAt) * 100) / 100);
  const isLaunch = request.requestType === 'LaunchRequest';
  const fallback = Boolean(state.launchFallback);
  const failed = Boolean(error) && !state.recovered;
  const directives = (response?.directives ?? []).map((directive) => directive?.type ?? 'unknown');
  const now = Date.now();

  console.log(JSON.stringify({
    _aws: {
      Timestamp: now,
      CloudWatchMetrics: [{
        Namespace: 'BurnsJukebox',
        Dimensions: [['RequestType']],
        Metrics: [
          { Name: 'RequestReceived', Unit: 'Count' },
          { Name: 'LaunchReceived', Unit: 'Count' },
          { Name: 'LaunchSuccess', Unit: 'Count' },
          { Name: 'LaunchFallback', Unit: 'Count' },
          { Name: 'LaunchFailure', Unit: 'Count' },
          { Name: 'LaunchLatency', Unit: 'Milliseconds' },
          { Name: 'HandlerLatency', Unit: 'Milliseconds' },
          { Name: 'ErrorCount', Unit: 'Count' }
        ]
      }]
    },
    RequestType: request.requestType,
    RequestReceived: 1,
    LaunchReceived: isLaunch ? 1 : 0,
    LaunchSuccess: isLaunch && !failed ? 1 : 0,
    LaunchFallback: isLaunch && fallback ? 1 : 0,
    LaunchFailure: isLaunch && failed ? 1 : 0,
    LaunchLatency: isLaunch ? latencyMs : 0,
    HandlerLatency: latencyMs,
    ErrorCount: error ? 1 : 0,
    event: 'AlexaRequestComplete',
    ...request,
    applicationIdValid: state.applicationIdValid,
    handlerSelected: state.handlerSelected,
    responseDirectiveTypes: directives,
    shouldEndSession: response?.shouldEndSession ?? null,
    launchFallbackReason: state.launchFallbackReason ?? null,
    error: safeError(error)
  }));
}

export const RequestTelemetryInterceptor = {
  process(handlerInput) {
    const state = stateFor(handlerInput);
    console.log(JSON.stringify({ event: 'AlexaRequestReceived', ...requestDetails(handlerInput) }));
    return state;
  }
};

export const ResponseTelemetryInterceptor = {
  process(handlerInput, response) {
    emit(handlerInput, response);
  }
};

export function setApplicationIdValidation(handlerInput, valid) {
  stateFor(handlerInput).applicationIdValid = Boolean(valid);
}

export function setLaunchFallback(handlerInput, reason) {
  const state = stateFor(handlerInput);
  state.launchFallback = true;
  state.launchFallbackReason = reason ?? 'unknown';
}

export function recordRequestError(handlerInput, error, response = null, { recovered = false } = {}) {
  const state = stateFor(handlerInput);
  state.recovered = recovered;
  emit(handlerInput, response, error);
}

export function instrumentHandler(name, handler) {
  return {
    canHandle: handler.canHandle.bind(handler),
    async handle(handlerInput) {
      stateFor(handlerInput).handlerSelected = name;
      return handler.handle(handlerInput);
    }
  };
}

export function instrumentHandlers(handlers) {
  return handlers.map((handler) => instrumentHandler(
    handler.telemetryName ?? Object.entries(handler).find(([, value]) => typeof value === 'string')?.[1] ?? 'anonymous',
    handler
  ));
}
