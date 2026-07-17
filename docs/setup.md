# Setup and upgrade guide

## 1. Requirements

- AWS account and AWS CLI credentials
- AWS SAM CLI
- Node.js 22 or newer
- Amazon Developer account
- Plex Media Server with Remote Access enabled
- A Plex music library
- A private Alexa custom skill

The architecture is fully serverless. Plex remains on its existing server, while Lambda, DynamoDB, and CloudFront are deployed in AWS.

## 2. Configure Plex

Enable Plex Remote Access and confirm the public endpoint uses HTTPS. Obtain a Plex token for the account that owns the music library and playlists.

Create local synchronized lyrics as sidecar `.lrc` files when possible. The filename should match the audio file. Refresh or rescan the library after adding lyrics.

For the strongest track-radio results, enable Plex sonic analysis for the music library when your Plex installation supports it.

## 3. Create the Alexa skill

In the Alexa Developer Console:

1. Create a Custom skill using your own endpoint.
2. Use `server music` as the invocation name, or change it consistently in the interaction model and examples.
3. Open the JSON editor and import `interaction-model/en-US.json`.
4. Save and build the interaction model.
5. Enable the **Audio Player** interface.
6. Enable the **Playback Controller** interface so screen and hardware play, pause, next, and previous controls reach the Lambda.
7. Copy the Skill ID into `.env` as `ALEXA_SKILL_ID`.

The skill may remain in development mode. Store publication is not required for private use on devices attached to the same Amazon developer account.

## 4. Configure the repository

```bash
cp .env.example .env
```

Set at least:

```dotenv
ALEXA_SKILL_ID=amzn1.ask.skill.your-id
PLEX_URL=https://your-public-plex-host.plex.direct:32400
PLEX_TOKEN=your-token
PLEX_MUSIC_LIBRARY=Music
AWS_REGION=us-east-1
```

Recommended enhanced defaults:

```dotenv
LYRICS_MODE=plex-lrclib
LYRICS_REQUEST_TIMEOUT_MS=2500
PERSONALITY_MODE=spicy
RADIO_TRACK_LIMIT=50
ALLOW_PLAYLIST_WRITES=true
```

Use `LYRICS_MODE=plex` when no track metadata should be sent to LRCLIB. Use `PERSONALITY_MODE=clean` when the deliberately cheeky responses are inappropriate.

## 5. Verify Plex discovery

```bash
npm ci
npm run discover:plex
```

Confirm the discovered `PLEX_URL` is the public HTTPS endpoint, not a LAN-only address.

## 6. Deploy AWS resources

```bash
npm run deploy
```

The deployment script performs the following before deploying:

- AWS identity check
- Node test suite
- JavaScript syntax checks
- Interaction-model validation
- SAM template linting
- SAM build

It then deploys:

- Lambda skill function
- DynamoDB queue table with TTL
- CloudFront distribution
- CloudWatch log group
- Alexa invocation permission restricted to the configured Skill ID

CloudFront injects the Plex token into origin requests through `X-Plex-Token`. The token is no longer included in the audio and artwork URLs returned to Alexa.

## 7. Connect the Lambda endpoint

Copy the `SkillFunctionArn` deployment output into the Alexa Developer Console endpoint configuration. Select the same AWS region used for deployment.

Save the endpoint configuration and rebuild the interaction model after any model changes.

## 8. Test

Start with basic playback:

```text
Alexa, open Server Music
Alexa, ask Server Music to play songs by Queen
Alexa, ask Server Music to play the album The Wall
Alexa, ask Server Music what is playing
```

Then test enhanced functions:

```text
Alexa, ask Server Music to play Everlong by Foo Fighters
Alexa, ask Server Music to play nineties music
Alexa, ask Server Music to play alternative music
Alexa, ask Server Music to play more like this
Alexa, ask Server Music to like this song
Alexa, ask Server Music to rate this track eight out of ten
Alexa, ask Server Music to add this song to my Road Trip playlist
Alexa, ask Server Music to run diagnostics
```

On an Echo Show or another compatible screen device, confirm:

- Square album artwork appears
- A full-screen background image appears
- Synchronized lyrics appear when timed lyrics are available
- Play, pause, next, and previous controls work

## 9. Upgrade an existing deployment

Pull the updated repository, preserve `.env`, and run:

```bash
npm ci
npm run deploy
```

Then re-import `interaction-model/en-US.json`, build the model, and enable Playback Controller if it was not previously enabled.

The CloudFront distribution is updated in place to inject the Plex token at the origin. Existing DynamoDB queue data remains compatible.

## 10. Troubleshooting

### Audio fails after the security upgrade

Confirm the CloudFront distribution origin has an `X-Plex-Token` custom header and that the stack deployment completed successfully. Audio URLs should not contain `X-Plex-Token` anymore.

### Artwork is missing

Confirm the track has Plex artwork and that the CloudFront hostname can retrieve both the original image and `/photo/:/transcode` image path over HTTPS.

### Lyrics are missing

- Confirm the local file is synchronized `.lrc`, not plain `.txt`.
- Refresh the Plex library item after adding the sidecar file.
- Confirm `LYRICS_MODE` is not `off`.
- Check Lambda logs for `Plex lyrics lookup failed` or `LRCLIB lyrics lookup failed`.
- A lyric result is intentionally rejected when title, artist, or duration matching is weak.

### Track radio returns mostly one artist

Plex sonic-nearest results were unavailable, so the skill used its artist fallback. Confirm sonic analysis is enabled and complete when supported by your Plex setup.

### Playlist addition fails

The target must already exist, be an audio playlist, and not be a smart playlist. Confirm `ALLOW_PLAYLIST_WRITES=true` and that the Plex token belongs to the playlist owner.

### Screen buttons do nothing

Enable Playback Controller in the Alexa Developer Console and rebuild the skill model. Audio Player alone does not deliver all hardware and screen control events.

### Generic playback chooses the wrong result

Use a more specific phrase such as:

```text
Alexa, ask Server Music to play the song Everlong by Foo Fighters
Alexa, ask Server Music to play the album The Wall
Alexa, ask Server Music to play my Road Trip playlist
```

### Check health without opening AWS

```text
Alexa, ask Server Music to run diagnostics
```

This reports live Plex connectivity, queue size, lyric mode, and playlist-write status.
