import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

export const HOME_SNAPSHOT_KEY = '__burns_jukebox_home_snapshot__';
export const DEFAULT_HOME_SNAPSHOT_READ_TIMEOUT_MS = 175;

function normalizeItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .slice(0, 24);
}

export function normalizeHomeContent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    recentAlbums: normalizeItems(value.recentAlbums),
    favorites: normalizeItems(value.favorites),
    playlists: normalizeItems(value.playlists),
    backgroundImage: typeof value.backgroundImage === 'string' ? value.backgroundImage : ''
  };
}

export class HomeSnapshotStore {
  constructor({ tableName, client } = {}) {
    if (!tableName) throw new Error('HomeSnapshotStore requires a table name');
    this.tableName = tableName;
    this.client = client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true }
    });
  }

  async get({ timeoutMs = DEFAULT_HOME_SNAPSHOT_READ_TIMEOUT_MS } = {}) {
    const startedAt = Date.now();
    let timer;
    try {
      const lookup = this.client.send(new GetCommand({
        TableName: this.tableName,
        Key: { userId: HOME_SNAPSHOT_KEY },
        ConsistentRead: false
      })).then((response) => {
        const content = normalizeHomeContent(response.Item?.homeSnapshot);
        if (!content) {
          return {
            status: response.Item ? 'invalid' : 'miss',
            content: null,
            updatedAt: null,
            elapsedMs: Date.now() - startedAt
          };
        }
        return {
          status: 'hit',
          content,
          updatedAt: Number(response.Item?.updatedAt) || null,
          elapsedMs: Date.now() - startedAt
        };
      }).catch((error) => ({
        status: 'error',
        content: null,
        updatedAt: null,
        elapsedMs: Date.now() - startedAt,
        error
      }));

      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve({
          status: 'timeout',
          content: null,
          updatedAt: null,
          elapsedMs: Date.now() - startedAt
        }), timeoutMs);
      });

      return await Promise.race([lookup, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async put(content) {
    const normalized = normalizeHomeContent(content);
    if (!normalized) throw new Error('Home snapshot content is invalid');
    const updatedAt = Date.now();
    await this.client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        userId: HOME_SNAPSHOT_KEY,
        type: 'homeSnapshot',
        schemaVersion: 1,
        updatedAt,
        homeSnapshot: normalized
      }
    }));
    return { content: normalized, updatedAt };
  }
}
