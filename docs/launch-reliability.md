# Burns Jukebox launch reliability

The Echo Show launch path renders the existing APL home screen, but Plex-backed home sections are now latency-bounded so a slow or unavailable Plex endpoint cannot hold the Alexa launch response indefinitely.

Each home section has a 750 ms budget. A section that errors or exceeds that budget degrades to an empty section while the rest of the home screen remains valid. This keeps the launch path isolated from playback, radio, queue, and lyric controls.

Regression coverage verifies all-failure behavior, indefinite Plex calls, repeated intermittent failures, and that the existing radio and lyric-offset APL actions remain unchanged.
