import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

function preferenceKey(userId) {
  return `${userId}#preferences`;
}

function asStringSet(value) {
  if (value instanceof Set) return new Set([...value].map(String));
  if (Array.isArray(value)) return new Set(value.map(String));
  return new Set();
}

export class QueueStore {
  constructor({ tableName, client } = {}) {
    if (!tableName) throw new Error('QueueStore requires a table name');
    this.tableName = tableName;
    this.client = client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true }
    });
  }

  async get(userId) {
    const response = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { userId },
      ConsistentRead: true
    }));
    return response.Item?.queue ?? null;
  }

  async put(userId, queue) {
    queue.updatedAt = Date.now();
    await this.client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        userId,
        expiresAt: queue.expiresAt,
        queue
      }
    }));
    return queue;
  }

  async getBlockedTrackIds(userId) {
    const response = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { userId: preferenceKey(userId) },
      ConsistentRead: true
    }));
    return asStringSet(response.Item?.blockedTrackIds);
  }

  async blockTrack(userId, ratingKey) {
    const trackId = String(ratingKey ?? '').trim();
    if (!trackId) return;
    await this.client.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { userId: preferenceKey(userId) },
      UpdateExpression: 'SET updatedAt = :updatedAt ADD blockedTrackIds :trackIds',
      ExpressionAttributeValues: {
        ':trackIds': new Set([trackId]),
        ':updatedAt': Date.now()
      }
    }));
  }

  async unblockTrack(userId, ratingKey) {
    const trackId = String(ratingKey ?? '').trim();
    if (!trackId) return;
    await this.client.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { userId: preferenceKey(userId) },
      UpdateExpression: 'SET updatedAt = :updatedAt DELETE blockedTrackIds :trackIds',
      ExpressionAttributeValues: {
        ':trackIds': new Set([trackId]),
        ':updatedAt': Date.now()
      }
    }));
  }

  async clearPreferences(userId) {
    await this.client.send(new DeleteCommand({
      TableName: this.tableName,
      Key: { userId: preferenceKey(userId) }
    }));
  }
}
