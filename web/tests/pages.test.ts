import assert from 'node:assert/strict';
import test from 'node:test';
import { publicDemoSnapshot } from '../pages/snapshot';
import { marketWireSchema } from '../lib/wire-schema';

test('public preview is deterministic, labelled demo, and valid for the dashboard', () => {
  const first = publicDemoSnapshot();
  assert.deepEqual(publicDemoSnapshot(), first);
  assert.equal(marketWireSchema.safeParse(first).success, true);
  assert.equal(first.mode, 'demo');
  assert.equal(first.stocks.length, 12);
  assert.ok(first.stocks.every(stock => stock.quote.kind === 'demo'));
  assert.equal(first.fetchedAt, first.snapshotAt);
  assert.equal(first.universe, undefined);
  assert.ok(first.warnings.some(message => message.includes('simulated')));
});
