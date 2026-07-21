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
2. Use `burns jukebox` as the invocation name, or change it consistently in the interaction model and examples.
3. Open the JSON editor and import `interaction-model/en-US.json`.
4. Save and build the interaction model.
5. Enable the **Audio Player** interface.
6. Enable the **Playback Controller** interface so screen and hardware play, pause, next, and previous controls reach the Lambda.
7. Enable **Alexa Presentation Language**.
8. Select every APL viewport profile. The documents are responsive and include a dedicated `hubLandscapeSmall` layout for the Echo Show 5.
9. Save the interfaces and build the model again.
10. Copy the Skill ID into `.env` as `ALEXA_SKILL_ID`.

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

Use `LYRICS_MODE=plex` when no track metadata should be sent to LRCLIB. Use `PERSONALITY_MODE=clean` when the deliberately vulgar responses are inappropriate.

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

CloudFront injects the Plex token into origin requests through `X-Plex-Token`. The token is not included in the audio and artwork URLs returned to Alexa.

## 7. Connect the Lambda endpoint

Copy the `SkillFunctionArn` deployment output into the Alexa Developer Console endpoint configuration. Select the same AWS region used for deployment.

Save the endpoint configuration and rebuild the interaction model after any model changes.

## 8. Test

Start with basic playback:

```text
Alexa, open Burns Jukebox
Alexa, ask Burns Jukebox to play songs by Queen
Alexa, ask Burns Jukebox to play the album The Wall
Alexa, ask Burns Jukebox what is playing
```

Then test matching and controls:

```text
Alexa, ask Burns Jukebox to play artist Banson Boon
Alexa, ask Burns Jukebox to play Neighborhood
Alexa, ask Burns Jukebox to play more like this
Alexa, ask Burns Jukebox to skip ahead thirty seconds
Alexa, ask Burns Jukebox to favorite this song
Alexa, ask Burns Jukebox to never play this again
Alexa, ask Burns Jukebox to add this song to my Road Trip playlist
```

On an Echo Show 5, test the visual flows:

```text
Alexa, open Burns Jukebox
Alexa, ask Burns Jukebox to show my music
Alexa, ask Burns Jukebox to show the queue
Alexa, ask Burns Jukebox to show lyrics
```

Confirm:

- Recently added albums, favorites, and playlists come from the actual Plex library
- The Echo Show 5 uses a compact native layout rather than a scaled large-screen layout
- Plex artwork appears as large cover art and a blurred darkened background
- Album, favorite, and playlist cards start the selected Plex item
- Queue rows jump directly to the selected track
- Previous, next, seek, favorite, ban, radio, and lyrics touch controls work
- The karaoke screen advances synchronized lyric lines
- `Lyrics -1s` and `Lyrics +1s` shift both custom lyrics and AudioPlayer captions without changing the audio position
- Ambiguous low-confidence searches display no more than three Plex-only choices
- A single clear library match, such as Benson Boone being the only plausible B artist, plays immediately
- The stock Alexa AudioPlayer screen still shows album art, background art, metadata, captions, and playback controls

## 9. Upgrade an existing deployment

Pull the updated repository, preserve `.env`, and run:

```bash
npm ci
npm run deploy
```

Then:

1. Re-import `interaction-model/en-US.json`.
2. Enable Playback Controller if it was not previously enabled.
3. Enable Alexa Presentation Language and all viewport profiles.
4. Save interfaces and rebuild the model.

Existing DynamoDB queue data remains compatible. Older queue records do not contain `lyricsOffsetMs`; the skill treats the missing value as zero.

## 10. Troubleshooting

### Audio fails after the security upgrade

Confirm the CloudFront distribution origin has an `X-Plex-Token` custom header and that the stack deployment completed successfully. Audio URLs should not contain `X-Plex-Token` anymore.

### Artwork is missing

Confirm the Plex item has artwork and that the CloudFront hostname can retrieve both the original image and `/photo/:/transcode` image path over HTTPS.

### The custom visual screens do not appear

- Confirm **Alexa Presentation Language** is enabled in the Alexa Developer Console.
- Confirm all viewport profiles are selected.
- Re-import the latest `interaction-model/en-US.json` and rebuild the model.
- Confirm the request is coming from an APL-capable Echo Show. Speaker-only Echo devices intentionally keep the voice-only path.

### The home screen is missing one section

The screen isolates Plex section failures. For example, favorites can fail while recent albums and playlists still render. Check Lambda logs for the failed Plex request and confirm the Plex token can read ratings and playlists.

### Lyrics are missing

- Confirm the local file is synchronized `.lrc`, not plain `.txt`.
- Refresh the Plex library item after adding the sidecar file.
- Confirm `LYRICS_MODE` is not `off`.
- Check Lambda logs for `Plex lyrics lookup failed`, `LRCLIB lyrics lookup failed`, or `Custom lyrics screen lookup failed`.
- A lyric result is intentionally rejected when title, artist, or duration matching is weak.

### Lyrics are early or late

Open the lyric screen and use `Lyrics -1s` or `Lyrics +1s`. The offset is stored with the active queue and applied to both the APL line schedule and the WebVTT captions sent with the AudioPlayer directive.

### Track radio returns mostly one artist

Plex sonic-nearest results were unavailable, so the skill used its artist fallback. Confirm sonic analysis is enabled and complete when supported by your Plex setup.

### Playlist addition fails

The target must already exist, be an audio playlist, and not be a smart playlist. Confirm `ALLOW_PLAYLIST_WRITES=true` and that the Plex token belongs to the playlist owner.

### Stock player buttons work but custom buttons do nothing

Playback Controller is not enough for APL buttons. Enable Alexa Presentation Language, save interfaces, and rebuild the model. Custom buttons use `Alexa.Presentation.APL.UserEvent` requests.

### A search displays a confirmation screen too often

The screen appears only when at least two Plex candidates are credible and their confidence scores are close. Confirm duplicate or badly named artists and albums are not present in Plex. Exact and high-confidence requests bypass confirmation.

### Generic playback chooses the wrong result

Use a more specific phrase such as:

```text
Alexa, ask Burns Jukebox to play the song Everlong by Foo Fighters
Alexa, ask Burns Jukebox to play the album The Wall
Alexa, ask Burns Jukebox to play my Road Trip playlist
```

### Check health without opening AWS

```text
Alexa, ask Burns Jukebox to run diagnostics
```

This reports live Plex connectivity, queue size, lyric mode, and playlist-write status.
