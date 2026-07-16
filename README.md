# Alexa Plex Proxy

A private, fully serverless Alexa custom skill for playing music from Plex.

There is no Unraid application, Docker container, reverse proxy, custom domain, or always-on middleware to manage.

```text
Alexa voice request
        |
        v
AWS Lambda  -----> Plex API on your existing remote-access endpoint
        |
        v
DynamoDB queue state

Alexa audio request
        |
        v
CloudFront HTTPS :443 -----> Plex Remote Access HTTPS :32400
```

The architecture follows the current working pattern used by `mwstowe/plexMusicPlayer`, reimplemented in Node.js. Lambda searches Plex and manages playback. CloudFront gives Alexa the required trusted HTTPS endpoint on port 443 and connects directly to the Plex endpoint you already expose.

## What works

- Play a song, artist, album, or Plex audio playlist
- Generic requests such as `Alexa, ask Plex Music to play Queen`
- Shuffle an artist or playlist
- Pause, resume, next, previous, start over, shuffle, and loop
- Continuous queue playback through `AudioPlayer.PlaybackNearlyFinished`
- DynamoDB-backed queue and resume position across Lambda cold starts
- Album artwork on supported Alexa devices
- Plex Now Playing timeline updates
- Direct playback for compatible MP3 and AAC files
- Plex MP3 transcoding for FLAC and other unsupported formats
- Private development-mode skill, no Alexa Store publication required

## What you say

```text
Alexa, ask Plex Music to play Queen
Alexa, ask Plex Music to play songs by Queen
Alexa, ask Plex Music to play the album The Wall
Alexa, ask Plex Music to play the song Everlong
Alexa, ask Plex Music to play my Road Trip playlist
Alexa, ask Plex Music to shuffle songs by Queen
Alexa, next
Alexa, pause
Alexa, resume
```

A private custom skill still needs the invocation phrase, usually `ask Plex Music`. It does not replace a first-party provider command such as `Alexa, play Queen`.

## AWS resources

The included SAM template creates:

- One Node.js 24 Lambda function
- One on-demand DynamoDB table with TTL
- One CloudFront distribution
- CloudWatch logs retained for 14 days
- The Alexa invocation permission restricted to your Skill ID

Your Plex server remains where it is. CloudFront uses its existing public Plex Remote Access hostname as a custom origin.

## Quick start

See [docs/setup.md](docs/setup.md) for the complete process.

The high-level steps are:

1. Enable Plex Remote Access.
2. Obtain your Plex token.
3. Create a private Alexa custom skill and copy its Skill ID.
4. Run the included Plex discovery script to find the public `plex.direct` hostname and port.
5. Deploy the SAM stack.
6. Paste the Lambda ARN into the Alexa Developer Console.
7. Enable the Audio Player interface and test the skill.

```bash
npm install
PLEX_TOKEN='your-token' npm run discover:plex
sam build
sam deploy --guided
```

## Security tradeoff

This project is optimized for a private skill and minimal infrastructure.

The Plex token is:

- Stored in the Lambda environment through a `NoEcho` CloudFormation parameter
- Sent by Lambda to Plex for catalog requests
- Included in the private audio and artwork URLs given to Alexa
- Forwarded by CloudFront to Plex

The token is not stored in DynamoDB, committed to Git, or intentionally written to logs. CloudFront access logging is not enabled.

This is the same practical token-in-URL model used by existing private Alexa Plex projects. It is simpler than running a home gateway, but it is not appropriate for a public multi-user service.

## Audio behavior

`TRANSCODE_POLICY=auto` is the default:

- MP3 and AAC at Alexa-supported bitrates are streamed directly.
- FLAC and other unsupported formats use Plex's universal MP3 transcoder.
- The default transcode bitrate is 192 kbps.

Plex must have permission and enough CPU capacity to transcode unsupported files.

## Development

```bash
npm install
npm test
npm run check
cfn-lint template.yaml
```

The tests use mocked metadata and do not require Plex, AWS, or Alexa.

## Prior art

Behavior and architecture were informed by:

- `mwstowe/plexMusicPlayer`, current CloudFront-to-Plex architecture, GPL-3.0
- `andresponte/askplex`, Alexa playback and queue behavior, MIT
- `erinlkolp/alexa-plex-music-player-skill`, private Plex connection patterns, MIT
- `Kuro4/askplex-Lite`, lightweight private-skill behavior, MIT-derived

This repository is an original Node.js implementation. GPL source code was not copied.

## License

MIT
