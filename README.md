# Alexa Plex Proxy

A private, fully serverless Alexa custom skill for playing and managing music from Plex.

There is no Docker container, Unraid application, reverse proxy, custom domain, or always-on middleware to manage.

```text
Alexa voice, touch, and screen controls
                 |
                 v
AWS Lambda  -----> Plex catalog, ratings, playlists, lyrics, and timeline APIs
                 |
                 v
DynamoDB queue state and permanent track bans

Alexa audio and artwork requests
                 |
                 v
CloudFront HTTPS :443 --X-Plex-Token header--> Plex Remote Access HTTPS :32400
```

CloudFront injects the Plex token into origin requests. Audio and artwork URLs sent to Alexa no longer contain the Plex token.

## Highlights

- Play a song, artist, album, audio playlist, genre, mood, style, or decade
- Phonetic and typo-tolerant matching for Alexa mistakes such as `banson boon` matching Benson Boone
- Article and spelling normalization, including `Neighborhood` matching The Neighbourhood
- Plex-only confidence ranking that plays a clear winner immediately and shows choices only for genuinely close matches
- Cached broad-catalog fallback when Plex exact search returns nothing useful
- Responsive APL home screen built from Plex albums, favorites, and playlists
- Echo Show 5-specific `hubLandscapeSmall` layouts instead of relying on scaled-down large-screen designs
- Touch queue with direct track selection, previous, next, seek, favorite, ban, radio, and lyrics controls
- Karaoke-style synchronized lyric screen with previous, current, and next lines
- Manual plus or minus one-second lyric synchronization that also updates AudioPlayer captions
- Blurred Plex artwork, dark gradients, large album art, and readable across-the-room typography
- Shuffle, loop, pause, resume, next, previous, start over, skip ahead, and rewind
- Physical and on-screen Playback Controller buttons
- Continuous queue playback through `AudioPlayer.PlaybackNearlyFinished`
- Large square artwork plus full-screen background artwork on the stock Alexa audio player
- Timed lyrics on compatible screen devices using WebVTT captions
- Local Plex `.lrc` lyrics first, with optional LRCLIB fallback
- Track radio using Plex sonic-nearest tracks with artist fallback
- Favorite and thumbs-up support through Plex ratings
- Permanent per-user `never play this again` bans stored in DynamoDB
- Add the current song to an existing editable Plex playlist
- Plex connectivity and queue diagnostics
- Plex Now Playing timeline updates
- Direct MP3/AAC playback and Plex MP3 transcoding for unsupported formats
- Configurable clean or short, randomized, intentionally vulgar responses

## Voice examples

```text
Alexa, ask Burns Jukebox to play artist Benson Boone
Alexa, ask Burns Jukebox to play The Neighbourhood
Alexa, ask Burns Jukebox to play Everlong by Foo Fighters
Alexa, ask Burns Jukebox to shuffle my Road Trip playlist
Alexa, ask Burns Jukebox to show my music
Alexa, ask Burns Jukebox to show the queue
Alexa, ask Burns Jukebox to show lyrics
Alexa, ask Burns Jukebox to play more like this
Alexa, ask Burns Jukebox to skip ahead thirty seconds
Alexa, ask Burns Jukebox to rewind fifteen seconds
Alexa, ask Burns Jukebox to favorite this song
Alexa, ask Burns Jukebox to give this a thumbs down
Alexa, ask Burns Jukebox to never play this again
Alexa, ask Burns Jukebox to add this song to my Road Trip playlist
Alexa, next
Alexa, pause
Alexa, resume
```

A private custom skill still needs the invocation phrase, usually `ask Burns Jukebox`. It does not replace a first-party provider command such as `Alexa, play Queen`.

## Visual experience

On APL-capable Echo Show devices, opening Burns Jukebox displays a Plex-backed browse screen with recently added albums, highly rated tracks, and audio playlists. Every card is generated from the items actually present in Plex.

The queue and lyric screens use the real Plex cover art as a blurred, darkened backdrop. The Echo Show 5 receives a dedicated compact layout with large touch targets. Touch events are sent back to Lambda through `Alexa.Presentation.APL.UserEvent` and use the same queue, ratings, bans, radio, and playback code as voice commands.

Alexa still owns the persistent long-form AudioPlayer screen after playback starts. The skill continues to provide that screen with square album art, background artwork, title, artist, album, and synchronized WebVTT captions. The custom APL screens are used for browsing, ambiguity confirmation, queue management, and karaoke mode without replacing the reliable stock audio player.

## Matching behavior

Plex search is attempted first. Weak or empty results fall back to a cached catalog scan with edit-distance, token, spelling, and phonetic scoring. Artist and album catalogs are cached in a warm Lambda for ten minutes. The track fallback is intentionally bounded so a bad transcription does not turn every request into an unbounded library scan.

A single credible Plex result is played immediately, even when Alexa transcribes it badly. For example, if Benson Boone is the only plausible artist in the library, `banson boon` plays without asking a pointless question. A visual confirmation screen appears only when multiple Plex items have close confidence scores.

Explicit track bans are stored separately from Plex ratings because Plex metadata does not consistently distinguish an unrated track from a zero rating. A thumbs-up or favorite on the current track removes its local ban.

## Lyrics

The skill looks for synchronized lyrics in this order:

1. Timed local lyrics exposed by Plex, normally a sidecar `.lrc` file.
2. LRCLIB cached exact match, then a conservative title/artist/duration search when `LYRICS_MODE=plex-lrclib`.

Plain `.txt` lyrics are intentionally not fabricated into fake timing. Lyrics are omitted when a sufficiently strong synchronized match is unavailable.

The karaoke screen schedules upcoming line changes directly in APL. The `Lyrics -1s` and `Lyrics +1s` controls persist an offset on the active queue, restart the same audio position with a new stream token, and shift both the custom screen and stock Alexa captions.

Set `LYRICS_MODE=plex` to keep lyric lookup entirely inside Plex, or `LYRICS_MODE=off` to disable it. LRCLIB fallback sends track title, artist, album, and duration to LRCLIB.

## Personality

`PERSONALITY_MODE=spicy` is the default. It uses short randomized responses and intentionally includes profanity. Set it to `clean` for straightforward responses.

## Plex feature notes

- Sonic track radio works best when Plex sonic analysis is available. It falls back to songs by the same artist when it is not.
- Playlist additions work only with an existing regular audio playlist. Smart playlists are read-only.
- Genre, mood, style, decade, and rating quality depend on the metadata in the Plex music library.
- Album artwork, APL screens, and timed lyrics display only on compatible Alexa devices with screens.
- APL section failures are isolated. If favorites fail to load, albums and playlists still render instead of breaking launch.

## Quick start

See [docs/setup.md](docs/setup.md) for the complete setup and upgrade process.

```bash
cp .env.example .env
npm ci
npm run discover:plex
npm run deploy
```

In the Alexa Developer Console, enable all three interfaces used by the skill:

1. **Audio Player**
2. **Playback Controller**
3. **Alexa Presentation Language**, with all viewport profiles selected

After every interaction-model change, import `interaction-model/en-US.json`, save it, and rebuild the model. The APL interface and rebuilt model are required for the browse, queue, lyrics, and visual confirmation commands.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PLEX_MUSIC_LIBRARY` | `Music` | Preferred Plex music library name |
| `MAX_QUEUE_TRACKS` | `150` | Maximum tracks retained in a queue |
| `MAX_AUDIO_BITRATE` | `192` | Plex MP3 transcode bitrate |
| `TRANSCODE_POLICY` | `auto` | `auto`, `always`, or `never` |
| `QUEUE_TTL_HOURS` | `24` | DynamoDB queue expiration |
| `LYRICS_MODE` | `plex-lrclib` | `off`, `plex`, or `plex-lrclib` |
| `LYRICS_REQUEST_TIMEOUT_MS` | `2500` | Per-source timed lyric timeout |
| `PERSONALITY_MODE` | `spicy` | `clean` or `spicy` |
| `RADIO_TRACK_LIMIT` | `50` | Maximum tracks in track radio |
| `ALLOW_PLAYLIST_WRITES` | `true` | Permit adding songs to existing playlists |

## Security model

- `PlexToken` is a `NoEcho` CloudFormation parameter.
- Lambda uses the token in an HTTP header for Plex API calls.
- CloudFront injects the token as an origin-only `X-Plex-Token` header.
- Alexa receives token-free audio and image URLs.
- The token is not stored in DynamoDB, committed to Git, or intentionally written to logs.
- CloudFront access logging is disabled and caching remains disabled.

The token remains present in the Lambda environment and CloudFront distribution configuration, so access to those AWS resources must still be treated as privileged.

## Development

```bash
npm ci
npm test
npm run check
npm run validate:model
sam validate --lint
sam build
```

The automated tests use mocked metadata and do not require Plex, Alexa, or AWS. The regression suite covers the existing AudioPlayer directive behavior, queue state, matching, permanent bans, APL layout generation, touch-event payloads, confidence thresholds, lyric timing shifts, and screen-data failure isolation.

## Prior art

Behavior and architecture were informed by:

- `mwstowe/plexMusicPlayer`, current CloudFront-to-Plex architecture, GPL-3.0
- `andresponte/askplex`, Alexa playback and queue behavior, MIT
- `erinlkolp/alexa-plex-music-player-skill`, private Plex connection patterns, MIT
- `Kuro4/askplex-Lite`, lightweight private-skill behavior, MIT-derived

This repository is an original Node.js implementation. GPL source code was not copied.

## License

MIT
