import test from 'node:test';
import assert from 'node:assert/strict';
import { QueueStore } from '../src/queue-store.js';

class MockClient {
  constructor(getResponse = {}) {
    this.getResponse = getResponse;
    this.commands = [];
  }

  async send(command) {
    this.commands.push(command);
    if (command.constructor.name === 'GetCommand') return this.getResponse;
    return {};
  }
}

test('reads permanent blocked tracks from a separate preference record', async () => {
  const client = new MockClient({ Item: { blockedTrackIds: new Set(['12', '34']) } });
  const store = new QueueStore({ tableName: 'queues', client });

  const blocked = await store.getBlockedTrackIds('user-1');

  assert.deepEqual([...blocked].sort(), ['12', '34']);
  assert.deepEqual(client.commands[0].input.Key, { userId: 'user-1#preferences' });
  assert.equal(client.commands[0].input.ConsistentRead, true);
});

test('adds and removes permanent track blocks atomically', async () => {
  const client = new MockClient();
  const store = new QueueStore({ tableName: 'queues', client });

  await store.blockTrack('user-1', '99');
  await store.unblockTrack('user-1', '99');

  assert.equal(client.commands[0].constructor.name, 'UpdateCommand');
  assert.match(client.commands[0].input.UpdateExpression, /ADD blockedTrackIds/);
  assert.deepEqual([...client.commands[0].input.ExpressionAttributeValues[':trackIds']], ['99']);
  assert.equal(client.commands[1].constructor.name, 'UpdateCommand');
  assert.match(client.commands[1].input.UpdateExpression, /DELETE blockedTrackIds/);
  assert.deepEqual([...client.commands[1].input.ExpressionAttributeValues[':trackIds']], ['99']);
});
