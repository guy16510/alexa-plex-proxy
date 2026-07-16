# Alexa Plex Proxy

A private Alexa custom skill that plays music from a local Plex Media Server without exposing the Plex token to Alexa or AWS.

The project is intentionally split into two small services:

```text
Alexa device
    |
    v
AWS Lambda custom skill
    | authenticated catalog requests
    v
HTTPS gateway on Unraid
    | local Plex API and audio requests
    v
Plex Media Server
```

The Lambda stores only queue metadata in DynamoDB. Plex search and streaming happen through the gateway running beside Plex. Alexa receives short-lived HMAC-signed stream URLs, never the long-lived Plex token.

## What works

- Play a song, artist, album, or Plex audio playlist
- Generic search, for example `Alexa, ask Plex Music to play Queen`
- Pause, resume, next, previous, start over
- Shuffle and loop
- Persistent queues across Lambda cold starts
- HTTP byte-range forwarding for seeking and reliable Echo playback
- Direct MP3/AAC playback, with Plex-managed audio transcoding for other source formats such as FLAC
- Private development-mode Alexa skill, no publication required

## Voice examples

```text
Alexa, ask Plex Music to play Queen
Alexa, ask Plex Music to play songs by Queen
Alexa, ask Plex Music to play the album The Wall
Alexa, ask Plex Music to play the song Everlong
Alexa, ask Plex Music to play my Road Trip playlist
Alexa, next
Alexa, pause
Alexa, resume
```

A custom skill generally requires the invocation phrase, `ask Plex Music`. This is not a first-party Alexa music provider integration.

## Requirements

- Node.js 20 or newer
- Plex Media Server with a music library
- Unraid or another always-on Docker host
- A public HTTPS hostname on port 443 routed to the gateway
- Amazon Developer account
- AWS account for Lambda and DynamoDB

Your existing domain is useful for the public stream endpoint. The skill itself is hosted by Lambda and does not need to run from your domain.

## Repository layout

```text
packages/gateway     Unraid-hosted Plex search and audio proxy
packages/skill       Alexa Lambda, interaction model, and SAM template
docs/setup.md        Complete deployment walkthrough
docker-compose.yml   Gateway deployment
```

## Local development

```bash
npm install
npm test
cp .env.example .env
npm run start:gateway
```

Test the gateway:

```bash
curl http://localhost:3000/healthz

curl -H "Authorization: Bearer $GATEWAY_API_KEY" \
  http://localhost:3000/readyz

curl -X POST \
  -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind":"artist","query":"Queen"}' \
  http://localhost:3000/v1/resolve
```

## Security model

- `PLEX_TOKEN` exists only in the gateway container on your network.
- Catalog endpoints require a separate bearer API key.
- Stream URLs are HMAC signed and expire after a short period.
- The stream endpoint only accepts Plex `/library/parts/.../file` paths.
- The reverse proxy should expose only this gateway, not Plex port 32400.
- Secrets are environment variables and are excluded from Git.

Use separate random values for `GATEWAY_API_KEY` and `STREAM_SIGNING_SECRET`:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

## Audio formats

MP3 and AAC in MP3, M4A, AAC, or MP4 containers are proxied directly. Other source formats (including FLAC) are requested through Plex's universal transcode endpoint; Plex performs the conversion and the gateway still proxies the response, so its token is never exposed. Ensure the Plex server has transcoding enabled and enough CPU capacity for the selected format.

## Common commands

```bash
npm install
npm test
npm run check
npm run build:gateway
npm run build:lambda
npm run deploy:lambda
npm run destroy:aws
```

## Prior art

This project is an original Node.js implementation informed by the Alexa playback and queue patterns in:

- `andresponte/askplex`, MIT licensed
- `mwstowe/plexMusicPlayer`, GPL-3.0 reference implementation
- `erinlkolp/alexa-plex-music-player-skill`, MIT licensed

No Plex token-bearing audio URLs from those projects are used here.

## License

MIT
