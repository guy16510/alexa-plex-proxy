# Complete setup

This deployment is entirely serverless. Nothing is installed on Unraid, and you do not need a custom domain or home reverse proxy.

## 1. Prerequisites

Install locally:

- Node.js 22 or newer
- AWS CLI
- AWS SAM CLI

You also need:

- An AWS account
- An Amazon Developer account
- Plex Media Server with a music library
- Plex Remote Access enabled

Use an AWS region supported by Alexa custom-skill Lambda endpoints. For a North American skill, `us-east-1` is the normal choice.

## 2. Find your Plex token

In Plex Web:

1. Open a media item.
2. Select **Get Info**.
3. Select **View XML**.
4. Find `X-Plex-Token` in the URL.

Do not commit the token or paste it into GitHub issues.

## 3. Find the Plex Remote Access origin

Copy `.env.example` to `.env`, set `PLEX_TOKEN`, then install dependencies and run the discovery script:

```bash
npm ci
npm run discover:plex
```

The script lists the Plex servers and connections associated with the token. Use the recommended external direct HTTPS connection.

Example output:

```text
Recommended SAM parameters:
  PlexOriginDomain=123-45-67-89.abcdef0123456789.plex.direct
  PlexOriginPort=32400
```

The domain must be entered without `https://` and without the port.

You can also inspect the resource endpoint manually:

```bash
curl -H "X-Plex-Token: YOUR_TOKEN" \
  'https://plex.tv/api/resources?includeHttps=1&includeRelay=1'
```

If no external direct HTTPS connection appears, fix Plex Remote Access before proceeding.

### Dynamic public IP warning

A `plex.direct` hostname can contain your public IP. If your public IP changes and Plex advertises a new hostname, rerun discovery and update the SAM stack with the new `PlexOriginDomain`.

## 4. Create the private Alexa skill

Open the Alexa Developer Console and create a skill:

- Skill name: `Plex Music`
- Primary locale: English (US)
- Model: Custom
- Hosting: Provision your own

After creation:

1. Copy the Skill ID from the developer console.
2. Open **Interaction Model**, then **JSON Editor**.
3. Paste the contents of `interaction-model/en-US.json`.
4. Save and build the model.
5. Open **Interfaces**.
6. Enable **Audio Player**.
7. Save the interface settings.

The skill can remain in development mode. It does not need certification or store publication for Echo devices registered to the same Amazon account.

## 5. Deploy AWS resources

Use `.env` as local deployment input only. It is ignored by Git; never commit it or token-bearing URLs. The automated deployment validates AWS identity, tests, the interaction model, SAM, Plex, and deployed resources without printing secret values:

```bash
npm run deploy
```

The deployment creates CloudFront, which can take several minutes to finish provisioning.

`PlexToken` is marked `NoEcho`, so SAM and CloudFormation mask it in parameter displays. It is still available to anyone with permission to inspect the Lambda configuration, which is expected for this private deployment.

## 6. Connect Alexa to Lambda

After deployment, SAM prints `SkillFunctionArn`.

In the Alexa Developer Console:

1. Open **Endpoint**.
2. Select **AWS Lambda ARN**.
3. Paste `SkillFunctionArn` into the Default Region field.
4. Save endpoints.
5. Rebuild the interaction model if prompted.

The SAM template grants invocation permission only to the Skill ID supplied during deployment.

## 7. Test Plex connectivity

Lambda queries your public Plex Remote Access endpoint directly. Before testing Alexa, verify the endpoint from outside your home network:

```bash
curl -H "X-Plex-Token: YOUR_TOKEN" \
  'https://YOUR-PLEX-DOMAIN.plex.direct:32400/identity'
```

You should receive Plex XML. A timeout, certificate error, or unauthorized response must be fixed before Lambda can work.

## 8. Test the skill

Use the Alexa simulator with device testing enabled, or use an Echo on the same Amazon account:

```text
Alexa, open Plex Music
Alexa, ask Plex Music to play songs by Queen
Alexa, ask Plex Music to play the album The Wall
Alexa, ask Plex Music to play the song Everlong
Alexa, ask Plex Music to play my Road Trip playlist
```

Then test:

```text
Alexa, next
Alexa, previous
Alexa, pause
Alexa, resume
Alexa, shuffle
Alexa, loop
Alexa, ask Plex Music what's playing
```

## 9. How streaming works

Lambda never carries the audio bytes.

For compatible MP3 and AAC tracks, Lambda gives Alexa a URL like:

```text
https://CLOUDFRONT-DOMAIN/library/parts/.../file.mp3?X-Plex-Token=...
```

For FLAC and other unsupported formats, Lambda gives Alexa a Plex transcode URL through the same CloudFront distribution:

```text
https://CLOUDFRONT-DOMAIN/music/:/transcode/universal/start.mp3?...
```

CloudFront accepts the Alexa request on trusted HTTPS port 443, forwards query parameters and range requests to Plex, and connects to the Plex origin on port 32400.

Caching is disabled so Plex authenticates each request and serves the requested byte range or transcode session directly.

## 10. Configuration options

### `TranscodePolicy`

- `auto`, direct-play compatible MP3/AAC and transcode everything else
- `always`, transcode every track to MP3
- `never`, never request a Plex transcode

Use `auto` unless troubleshooting indicates otherwise.

### `MaxAudioBitrate`

The default is 192 kbps. Alexa accepts audio streams from 16 through 384 kbps. Lower the setting if your upstream internet connection or Plex server struggles.

### `MaxQueueTracks`

The default is 150 and the maximum is 500. Very large artist queues increase DynamoDB item size and Plex query time.

## Troubleshooting

### Alexa says Plex Music had an error

Check Lambda logs:

```bash
sam logs --stack-name alexa-plex-proxy \
  --name SkillFunction \
  --region us-east-1 \
  --tail
```

Common causes:

- Wrong Plex token
- Wrong music library name
- Plex Remote Access unavailable
- Wrong Plex origin hostname or port
- Skill ID mismatch

### Search works but audio does not play

Check the CloudFront output:

```bash
aws cloudformation describe-stacks \
  --stack-name alexa-plex-proxy \
  --query "Stacks[0].Outputs"
```

Then test a known Plex media path through CloudFront. Do not paste a token-bearing test URL into public logs or issues.

Also check:

- CloudFront distribution status is `Deployed`
- Plex origin certificate matches the configured origin hostname
- Plex Remote Access port is reachable externally
- The track can be transcoded when using FLAC

### MP3 works but FLAC fails

Set `TranscodePolicy` to `always` temporarily and redeploy. Check Plex Dashboard to see whether a transcode session starts. Confirm the Plex server has working transcoder permissions and free temporary space.

### Playback stops after one song

Check Lambda logs for `AudioPlayer.PlaybackNearlyFinished`. Confirm the Audio Player interface is enabled in the Alexa Developer Console and the queue item remains in DynamoDB.

### Alexa routes the request to Amazon Music

Use the full private-skill invocation:

```text
Alexa, ask Plex Music to play Queen
```

A custom skill cannot claim the global `Alexa, play Queen` provider command.

## Updating

After changing code:

```bash
npm test
npm run check
sam build
sam deploy
```

After changing only the Alexa interaction model, paste the updated JSON into the developer console and rebuild the model.

## Removing everything

```bash
sam delete --stack-name alexa-plex-proxy --region us-east-1
```

CloudFront distributions take time to disable and delete. SAM handles the dependency order.
