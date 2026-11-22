import test from 'node:test';
import assert from 'node:assert/strict';
import { PttArbiter } from '../realtime/arbiter.js';
import { AuthUser } from '../auth/jwt.js';

test('PTT Arbiter: single speaker turn grant and release', async () => {
  const arbiter = new PttArbiter();
  const channelId = 'channel-test-1';
  const userA: AuthUser = { id: 'u1', username: 'alice', displayName: 'Alice' };

  // Initial state: free
  assert.equal(arbiter.getCurrentSpeaker(channelId), null);

  // User A requests speak
  const res1 = await arbiter.requestTurn(channelId, userA);
  assert.equal(res1.granted, true);
  assert.equal(res1.currentSpeaker?.id, 'u1');
  assert.equal(arbiter.getCurrentSpeaker(channelId)?.id, 'u1');

  // User A releases speak
  const released = await arbiter.releaseTurn(channelId, 'u1');
  assert.equal(released, true);
  assert.equal(arbiter.getCurrentSpeaker(channelId), null);
});

test('PTT Arbiter: handles simultaneous presses and race conditions', async () => {
  const arbiter = new PttArbiter();
  const channelId = 'channel-test-2';
  const userA: AuthUser = { id: 'u1', username: 'alice', displayName: 'Alice' };
  const userB: AuthUser = { id: 'u2', username: 'bob', displayName: 'Bob' };

  // Both attempt to request turn concurrently
  const [resA, resB] = await Promise.all([
    arbiter.requestTurn(channelId, userA),
    arbiter.requestTurn(channelId, userB),
  ]);

  // Exactly one must be granted, the other denied
  const grantedCount = (resA.granted ? 1 : 0) + (resB.granted ? 1 : 0);
  assert.equal(grantedCount, 1, 'Only one speaker must be granted the turn');

  const winner = resA.granted ? resA : resB;
  const loser = resA.granted ? resB : resA;

  assert.equal(winner.granted, true);
  assert.equal(loser.granted, false);
  assert.equal(loser.reason, 'CHANNEL_BUSY');
  assert.equal(loser.currentSpeaker?.id, winner.currentSpeaker?.id);

  // Clean up
  await arbiter.releaseTurn(channelId, winner.currentSpeaker!.id);
});

test('PTT Arbiter: rejects release from unauthorized user', async () => {
  const arbiter = new PttArbiter();
  const channelId = 'channel-test-3';
  const userA: AuthUser = { id: 'u1', username: 'alice', displayName: 'Alice' };

  await arbiter.requestTurn(channelId, userA);

  // User B attempts to release User A's turn
  const stolenRelease = await arbiter.releaseTurn(channelId, 'u2-intruder');
  assert.equal(stolenRelease, false, 'Non-speaker must not be able to release another speaker turn');
  assert.equal(arbiter.getCurrentSpeaker(channelId)?.id, 'u1');

  // Proper release
  await arbiter.releaseTurn(channelId, 'u1');
});

test('PTT Arbiter: disconnect automatically frees turn', async () => {
  const arbiter = new PttArbiter();
  const channelId = 'channel-test-4';
  const userA: AuthUser = { id: 'u1', username: 'alice', displayName: 'Alice' };

  await arbiter.requestTurn(channelId, userA);
  assert.equal(arbiter.getCurrentSpeaker(channelId)?.id, 'u1');

  // Simulate user A socket disconnect
  arbiter.handleDisconnect('u1');
  assert.equal(arbiter.getCurrentSpeaker(channelId), null);
});
