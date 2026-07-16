# Unraid deployment

This folder follows the same deployment pattern used by `guy16510/beertap-lvgl/deploy/unraid`:

- `alexa-plex-proxy.xml` is the Unraid Docker template.
- `docker-compose.yml` is an equivalent Compose deployment.
- `.github/workflows/gateway-image.yml` publishes the gateway image to GHCR.

## Template URL

```text
https://raw.githubusercontent.com/guy16510/alexa-plex-proxy/main/deploy/unraid/alexa-plex-proxy.xml
```

## GHCR access

The image is published as:

```text
ghcr.io/guy16510/alexa-plex-proxy:latest
```

If the package remains private, authenticate the Unraid Docker daemon to GHCR using a GitHub classic personal access token with `read:packages`. Alternatively, make the package public in the GitHub package settings.

## Required values

Generate two different secrets:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Enter them as:

- `GATEWAY_API_KEY`
- `STREAM_SIGNING_SECRET`

Also configure:

- `PLEX_URL`, normally the local Plex address such as `http://192.168.1.20:32400`
- `PLEX_TOKEN`
- `PLEX_MUSIC_LIBRARY`, normally `Music`

The gateway is stateless and does not require an appdata volume.

## HTTPS requirement

The container listens on local port `3000`. Create a trusted HTTPS reverse-proxy hostname on port 443 and route it to the container. The Alexa Lambda uses that public hostname as `GATEWAY_BASE_URL`.

Verify after installation:

```bash
curl http://UNRAID-IP:3000/healthz
curl -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  http://UNRAID-IP:3000/readyz
```
