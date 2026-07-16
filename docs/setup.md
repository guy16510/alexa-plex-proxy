# Deployment guide

## 1. Create secrets

Generate two different secrets:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Use one as `GATEWAY_API_KEY` and the other as `STREAM_SIGNING_SECRET`.

## 2. Configure the gateway on Unraid

Clone the repository into an Unraid app-data or project directory:

```bash
git clone https://github.com/guy16510/alexa-plex-proxy.git
cd alexa-plex-proxy
cp .env.example .env
```

Set at least:

```dotenv
PLEX_URL=http://YOUR-PLEX-IP:32400
PLEX_TOKEN=YOUR_PLEX_TOKEN
PLEX_MUSIC_LIBRARY=Music
GATEWAY_API_KEY=LONG_RANDOM_VALUE
STREAM_SIGNING_SECRET=DIFFERENT_LONG_RANDOM_VALUE
```

Start it:

```bash
docker compose up -d --build
```

Verify local connectivity:

```bash
curl http://UNRAID-IP:3000/healthz
curl -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  http://UNRAID-IP:3000/readyz
```

The ready check confirms that the container can reach Plex and authenticate.

## 3. Put the gateway behind HTTPS

Create a hostname such as:

```text
music.yourdomain.com
```

Route HTTPS port 443 to the gateway's HTTP port 3000 using Nginx Proxy Manager, Caddy, Traefik, or your existing reverse proxy.

Required behavior:

- Valid publicly trusted TLS certificate
- HTTP/1.1 support
- Streaming responses without response buffering
- Forward `Range` and `If-Range` headers
- Do not cache `/v1/stream`
- Do not expose Plex port 32400 through this hostname

### Nginx example

```nginx
location / {
    proxy_pass http://UNRAID-IP:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Range $http_range;
    proxy_set_header If-Range $http_if_range;
    proxy_request_buffering off;
    proxy_buffering off;
}
```

Verify externally, not only from your home network:

```bash
curl https://music.yourdomain.com/healthz
```

## 4. Create the Alexa custom skill

In the Alexa Developer Console:

1. Create a new skill.
2. Choose **Custom** as the model.
3. Choose **Provision your own** for the backend.
4. Use English (US).
5. Open **Interaction Model**, then **JSON Editor**.
6. Paste `packages/skill/interaction-model/en-US.json`.
7. Open **Interfaces** and enable **Audio Player**.
8. Build the model.
9. Copy the Skill ID.

Leave the skill in development mode. It does not need store publication for Echo devices on the same Amazon account.

## 5. Deploy the Lambda and DynamoDB table

Install the AWS SAM CLI and authenticate the AWS CLI, then:

```bash
cd packages/skill
npm install
sam build
sam deploy --guided
```

Provide these parameter values:

- `AlexaSkillId`: the Skill ID from the developer console
- `GatewayBaseUrl`: `https://music.yourdomain.com`
- `GatewayApiKey`: same value used by the gateway
- `StreamSigningSecret`: same signing value used by the gateway
- `MaxQueueTracks`: `150`
- `StreamUrlTtlSeconds`: `900`

Use region `us-east-1` unless you have a reason not to. Alexa Lambda endpoints support a limited set of regions, and the North America endpoint commonly uses `us-east-1`.

After deployment, copy the `SkillFunctionArn` output.

## 6. Connect Alexa to Lambda

In the Alexa Developer Console:

1. Open **Endpoint**.
2. Select **AWS Lambda ARN**.
3. Paste the deployed ARN into the Default Region field.
4. Save endpoints.
5. Rebuild the model if prompted.

The SAM template grants invocation only to the supplied Alexa Skill ID.

## 7. Test

In the Alexa developer simulator or on an Echo associated with your account:

```text
Alexa, open Plex Music
Alexa, ask Plex Music to play songs by Queen
Alexa, ask Plex Music to play the album The Wall
```

Then test:

```text
Alexa, next
Alexa, pause
Alexa, resume
Alexa, shuffle
```

## Troubleshooting

### Search works but audio does not start

Check:

- The hostname is reachable from a cellular connection.
- TLS is valid and the stream is served through port 443.
- Your reverse proxy is not buffering the response.
- The source track is MP3 or AAC.
- The gateway log does not show `invalid_signature`, `expired`, or Plex errors.

### Gateway cannot reach Plex

Use the local Plex address in `PLEX_URL`, not the public hostname. Confirm that the Docker container can route to the Plex host.

### Alexa says the skill had an error

Check CloudWatch logs for the Lambda and confirm all environment variables were deployed. `ALEXA_SKILL_ID` must exactly match the developer console Skill ID.

### Alexa chooses Amazon Music instead

Use the full custom-skill invocation:

```text
Alexa, ask Plex Music to play Queen
```

`Alexa, play Queen` is normally routed to a built-in music provider, not a private custom skill.
