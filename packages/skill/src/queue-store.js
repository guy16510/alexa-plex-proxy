import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

export class QueueStore {
  constructor({ tableName, client } = {}) {
    this.tableName = tableName;
    this.client = client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));
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
    const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    await this.client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        userId,
        queue,
        expiresAt
      }
    }));
    return queue;
  }

  async delete(userId) {
    await this.client.send(new DeleteCommand({
      TableName: this.tableName,
      Key: { userId }
    }));
  }
}
