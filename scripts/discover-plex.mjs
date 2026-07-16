import { XMLParser } from 'fast-xml-parser';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ quiet: true });
const token = process.env.PLEX_TOKEN;
if (!token) {
  console.error('Set PLEX_TOKEN in the local .env file.');
  process.exit(1);
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false
});

const response = await fetch('https://plex.tv/api/resources?includeHttps=1&includeRelay=1', {
  headers: {
    Accept: 'application/xml',
    'X-Plex-Token': token,
    'X-Plex-Product': 'Alexa Plex Music Setup',
    'X-Plex-Version': '1.0.0',
    'X-Plex-Client-Identifier': 'alexa-plex-proxy-discovery'
  },
  signal: AbortSignal.timeout(15_000)
});

if (!response.ok) {
  console.error(`Plex resource discovery failed with status ${response.status}.`);
  process.exit(1);
}

const parsed = parser.parse(await response.text());
const devices = parsed?.MediaContainer?.Device;
const servers = (Array.isArray(devices) ? devices : [devices])
  .filter(Boolean)
  .filter((device) => String(device.provides || '').split(',').includes('server'));

if (servers.length === 0) {
  console.error('No Plex Media Server resources were found for this token.');
  process.exit(1);
}

for (const server of servers) {
  console.log(`\nServer: ${server.name}`);
  const connections = server.Connection;
  const list = (Array.isArray(connections) ? connections : [connections]).filter(Boolean);
  const externalHttps = list.filter(
    (connection) => String(connection.local) !== '1'
      && connection.protocol === 'https'
      && String(connection.relay) !== '1'
  );

  for (const connection of list) {
    const labels = [
      String(connection.local) === '1' ? 'local' : 'remote',
      String(connection.relay) === '1' ? 'relay' : 'direct'
    ];
    const connectionUrl = new URL(connection.uri);
    console.log(`  ${labels.join(', ')}: ${connectionUrl.protocol}//${connectionUrl.host}`);
  }

  const recommended = externalHttps.find((connection) => Number(connection.port) >= 1024);
  if (recommended) {
    const url = new URL(recommended.uri);
    console.log('\nDeployment-ready configuration:');
    console.log(`PLEX_ORIGIN_DOMAIN=${url.hostname}`);
    console.log(`PLEX_ORIGIN_PORT=${url.port || 443}`);
    console.log(`PLEX_SERVER_NAME=${server.name}`);
  } else {
    console.log('\nNo external direct HTTPS connection was found. Enable Plex Remote Access first.');
  }
}
