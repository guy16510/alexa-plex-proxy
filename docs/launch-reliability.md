# Burns Jukebox launch reliability

The Echo Show `LaunchRequest` no longer calls Plex. It reads a last-known-good home snapshot from DynamoDB with a 175 ms read budget and immediately renders the existing APL home screen. If the cache is missing, malformed, slow, or unavailable, launch falls back to a static valid home screen. If APL rendering itself fails, the handler falls back again to the normal spoken launch response.

A scheduled `HomeRefreshFunction` refreshes recently added albums, favorites, and playlists every five minutes. Those Plex calls run outside the Alexa request path. If all Plex sections are unavailable, the refresher preserves the previous snapshot instead of replacing known-good data with an outage-generated empty model. Partial refreshes are allowed when at least one Plex section succeeds.

Interactive requests that explicitly reopen the live home screen keep the existing 750 ms per-section Plex budget. Playback, radio, queue, lyrics, and lyric-offset controls remain separate from launch hardening.

Launch telemetry is emitted in CloudWatch Embedded Metric Format under the `BurnsJukebox` namespace with `LaunchSuccess`, `LaunchFallback`, `LaunchFailure`, and `LaunchLatency` metrics plus request and device/viewport diagnostics without exposing Plex or AWS secrets.

Every routed Alexa request now emits a receipt record and one completion record. The latter includes the request and intent types, request timestamp/ID, only the final eight characters of the device ID, supported interfaces, viewport, session state, application-ID validation result, selected handler, response directive types, session-ending flag, redacted errors, and total handler latency. Embedded metrics include `RequestReceived`, `LaunchReceived`, `LaunchSuccess`, `LaunchFallback`, `LaunchFailure`, `LaunchLatency`, `HandlerLatency`, and `ErrorCount`. An invocation that produces no `AlexaRequestReceived` record did not reach Lambda and is therefore an Alexa recognition/routing failure.

## Invocation routing

`burns jukebox` is valid but not ideal. Amazon explicitly warns that invocation names overlapping built-in Alexa features can route inconsistently. “Jukebox” is a generic music concept, so an immediate Alexa-owned response followed by a successful identical retry, with no corresponding Lambda receipt for the failure, is routing behavior that Lambda cannot repair. Prefer `open` or `ask`; `start` and especially `launch` can sound like media-control commands on some devices.

If physical-device history confirms continued misses after deployment, test these distinctive replacements before changing the model:

1. `burns sonic vault`
2. `burns record cabinet`
3. `burns melody archive`
4. `burns listening room`
5. `burns album attic`

## Drift-proof deployment

Store deployment settings in the ignored `.env.local` file (see `.env.example`) and authenticate both the AWS CLI and ASK CLI. `npm run deploy` validates/tests/builds and deploys SAM, uploads and builds the Alexa development interaction model, then runs `npm run verify:deployment`. Verification fails if the stack, Lambda Skill ID/permission/runtime, Git commit marker, Alexa endpoint, invocation name, AudioPlayer/APL interfaces, model build, or canonical interaction-model hash differs. Writes to certified/live stages are intentionally not automated; promotion remains an explicit Alexa certification action.

Regression coverage includes DynamoDB hit/miss/error/timeout/malformed states, all-Plex-failure last-known-good preservation, partial refreshes, an intentionally empty library, 100 repeated launch-model iterations, SAM schedule wiring, and static guards protecting radio and lyric-offset behavior.
