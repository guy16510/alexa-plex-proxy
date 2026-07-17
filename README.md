# Alexa Plex Proxy

A private, fully serverless Alexa custom skill for playing and managing music from Plex.

There is no Docker container, Unraid application, reverse proxy, custom domain, or always-on middleware to manage.

```text
Alexa voice and screen controls
             |
             v
AWS Lambda  -----> Plex catalog, ratings, playlists, lyrics, and timeline APIs
             |
             v
DynamoDB queue state

Alexa audio and artwork requests
             |
             v
CloudFront HTTPS :443 --X-Plex-Token header--> Plex Remote Access HTTPS :32400
```

CloudFront injects the Plex token into origin requests. Audio and artwork URLs sent to Alexa no longer contain the Plex token.

## Highlights

- Play a song, artist, album, audio playlist, genre, mood, style, or decade
- Better matching for requests such as `play Everlong by Foo Fighters`
- Shuffle, loop, pause, resume, next, previous, and start over
- Physical and on-screen Playback Controller buttons
- Continuous queue playback through `AudioPlayer.PlaybackNearlyFinished`
- Large square artwork plus full-screen background artwork on supported devices
- Timed lyrics on compatible screen devices using WebVTT captions
- Local Plex `.lrc` lyrics first, with optional LRCLIB fallback
- Track radio using Plex sonic-nearest tracks with artist fallback
- Like, dislike, and zero-to-ten Plex ratings
- Add the current song to an existing editable Plex playlist
- Plex connectivity and queue diagnostics
- Plex Now Playing timeline updates
- Direct MP3/AAC playback and Plex MP3 transcoding for unsupported formats
- Configurable clean or intentionally silly, mildly risqué responses

## Voice examples

```text
Alexa, ask Server Music to play Queen
Alexa, ask Server Music to play Everlong by Foo Fighters
Alexa, ask Server Music to play the album The Wall
Alexa, ask Server Music to shuffle my Road Trip playlist
Alexa, ask Server Music to play alternative music
Alexa, ask Server Music to play nineties music
Alexa, ask Server Music to play more like this
Alexa, ask Server Music to like this song
Alexa, ask Server Music to rate this track seven out of ten
Alexa, ask Server Music to add this song to my Road Trip playlist
Alexa, ask Server Music to run diagnostics
Alexa, next
Alexa, pause
Alexa, resume
```

A private custom skill still needs the invocation phrase, usually `ask Server Music`. It does not replace a first-party provider command such as `Alexa, play Queen`.

## Lyrics

The skill looks for synchronized lyrics in this order:

1. Timed local lyrics exposed by Plex, normally a sidecar `.lrc` file.
2. LRCLIB cached exact match, then a conservative title/artist/duration search when `LYRICS_MODE=plex-lrclib`.

Plain `.txt` lyrics are intentionally not fabricated into fake timing. Lyrics are omitted when a sufficiently strong synchronized match is unavailable.

Set `LYRICS_MODE=plex` to keep lyric lookup entirely inside Plex, or `LYRICS_MODE=off` to disable it. LRCLIB fallback sends track title, artist, album, and duration to LRCLIB.

## Personality

`PERSONALITY_MODE=spicy` is the default and uses randomized silly, mildly risqué responses. Set it to `clean` for straightforward responses.

## Plex feature notes

- Sonic track radio works best when Plex sonic analysis is available. It falls back to songs by the same artist when it is not.
- Playlist additions work only with an existing regular audio playlist. Smart playlists are read-only.
- Genre, mood, style, decade, and rating quality depend on the metadata in the Plex music library.
- Album artwork and timed lyrics display only on compatible Alexa devices with screens.

## Quick start

See [docs/setup.md](docs/setup.md) for the complete setup and upgrade process.

```bash
cp .env.example .env
npm ci
npm run discover:plex
npm run deploy
```

After deployment, import `interaction-model/en-US.json` into the Alexa Developer Console, build the model, and enable both the Audio Player and Playback Controller interfaces.

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

The automated tests use mocked metadata and do not require Plex, Alexa, or AWS.

## Prior art

Behavior and architecture were informed by:

- `mwstowe/plexMusicPlayer`, current CloudFront-to-Plex architecture, GPL-3.0
- `andresponte/askplex`, Alexa playback and queue behavior, MIT
- `erinlkolp/alexa-plex-music-player-skill`, private Plex connection patterns, MIT
- `Kuro4/askplex-Lite`, lightweight private-skill behavior, MIT-derived

This repository is an original Node.js implementation. GPL source code was not copied.

## License

MIT
