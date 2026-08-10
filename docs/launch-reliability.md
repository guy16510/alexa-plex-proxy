# Burns Jukebox launch reliability

The Echo Show `LaunchRequest` no longer calls Plex. It reads a last-known-good home snapshot from DynamoDB with a 175 ms read budget and immediately renders the existing APL home screen. If the cache is missing, malformed, slow, or unavailable, launch falls back to a static valid home screen. If APL rendering itself fails, the handler falls back again to the normal spoken launch response.

A scheduled `HomeRefreshFunction` refreshes recently added albums, favorites, and playlists every five minutes. Those Plex calls run outside the Alexa request path. If all Plex sections are unavailable, the refresher preserves the previous snapshot instead of replacing known-good data with an outage-generated empty model. Partial refreshes are allowed when at least one Plex section succeeds.

Interactive requests that explicitly reopen the live home screen keep the existing 750 ms per-section Plex budget. Playback, radio, queue, lyrics, and lyric-offset controls remain separate from launch hardening.

Launch telemetry is emitted in CloudWatch Embedded Metric Format under the `BurnsJukebox` namespace with `LaunchSuccess`, `LaunchFallback`, `LaunchFailure`, and `LaunchLatency` metrics plus request and device/viewport diagnostics without exposing Plex or AWS secrets.

Regression coverage includes DynamoDB hit/miss/error/timeout/malformed states, all-Plex-failure last-known-good preservation, partial refreshes, an intentionally empty library, 100 repeated launch-model iterations, SAM schedule wiring, and static guards protecting radio and lyric-offset behavior.
