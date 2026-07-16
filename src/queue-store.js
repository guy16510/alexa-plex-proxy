import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

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
}
