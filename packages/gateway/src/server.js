import http from 'node:http';
import { Readable } from 'node:stream';
import { loadConfig } from './config.js';
import { json, readJsonBody, extractBearerToken, secureStringEqual } from './http-utils.js';
import { PlexClient } from './plex-client.js';
import { verifyMediaSignature } from './signing.js';

const FORWARDED_RESPONSE_HEADERS = [
  'accept-ranges',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'last-modified'
];

export function createGatewayServer(config, { fetchImpl = fetch } = {}) {
  const plex = new PlexClient({
    baseUrl: config.plexUrl,
    token: config.plexToken,
    musicLibrary: config.plexMusicLibrary,
    fetchImpl,
    maxTracks: config.maxQueueTracks
  });

  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, 'http://gateway.local');

    try {
      if (req.method === 'GET' && requestUrl.pathname === '/healthz') {
        return json(res, 200, { ok: true, service: 'alexa-plex-proxy' });
      }

      if (req.method === 'GET' && requestUrl.pathname === '/readyz') {
        const token = extractBearerToken(req);
        if (!secureStringEqual(token, config.gatewayApiKey)) {
          return json(res, 401, { error: 'unauthorized' });
        }
        const plexIdentity = await plex.healthCheck();
        return json(res, 200, { ok: true, plex: plexIdentity });
      }

      if (req.method === 'POST' && requestUrl.pathname === '/v1/resolve') {
        const token = extractBearerToken(req);
        if (!secureStringEqual(token, config.gatewayApiKey)) {
          return json(res, 401, { error: 'unauthorized' });
        }

        const body = await readJsonBody(req);
        const kind = body.kind ?? 'any';
        const query = String(body.query ?? '').trim();
        if (!['any', 'track', 'artist', 'album', 'playlist'].includes(kind)) {
          return json(res, 400, { error: 'invalid_kind' });
        }
        if (!query || query.length > 200) {
          return json(res, 400, { error: 'invalid_query' });
        }

        const result = await plex.resolve(kind, query);
        if (!result) {
          return json(res, 404, { error: 'not_found' });
        }

        return json(res, 200, result);
      }

      if (
        ['GET', 'HEAD'].includes(req.method) &&
        requestUrl.pathname === '/v1/stream'
      ) {
        const verification = verifyMediaSignature({
          mediaPath: requestUrl.searchParams.get('path'),
          expiresAt: requestUrl.searchParams.get('exp'),
          signature: requestUrl.searchParams.get('sig'),
          secret: config.streamSigningSecret,
          maxTtlSeconds: config.streamUrlMaxTtlSeconds
        });

        if (!verification.ok) {
          return json(res, 403, { error: verification.reason });
        }

        const upstreamUrl = new URL(verification.mediaPath, `${config.plexUrl}/`);
        const upstreamHeaders = {
          'X-Plex-Token': config.plexToken,
          'X-Plex-Product': 'Alexa Plex Proxy',
          'X-Plex-Version': '0.1.0',
          'X-Plex-Client-Identifier': 'alexa-plex-proxy-stream'
        };

        for (const header of ['range', 'if-range', 'if-none-match', 'if-modified-since']) {
          if (req.headers[header]) upstreamHeaders[header] = req.headers[header];
        }

        const controller = new AbortController();
        res.on('close', () => controller.abort());

        const upstream = await fetchImpl(upstreamUrl, {
          method: req.method,
          headers: upstreamHeaders,
          redirect: 'follow',
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(30_000)
          ])
        });

        const headers = {
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff'
        };
        for (const header of FORWARDED_RESPONSE_HEADERS) {
          const value = upstream.headers.get(header);
          if (value) headers[header] = value;
        }

        res.writeHead(upstream.status, headers);
        if (req.method === 'HEAD' || !upstream.body) {
          return res.end();
        }

        Readable.fromWeb(upstream.body).pipe(res);
        return;
      }

      return json(res, 404, { error: 'not_found' });
    } catch (error) {
      console.error('Gateway request failed', error);
      if (!res.headersSent) {
        return json(res, error.statusCode ?? 500, {
          error: error.statusCode ? error.message : 'internal_error'
        });
      }
      res.destroy(error);
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const server = createGatewayServer(config);
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`Alexa Plex Proxy gateway listening on port ${config.port}`);
  });
}
