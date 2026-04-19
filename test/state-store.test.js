import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { StateStore } from '../src/infra/state-store.js';

test('StateStore should initialize daily state and block repeated runs after success', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-checkin-test-'));
  const statePath = path.join(tmpDir, 'state.json');
  const store = new StateStore(statePath);

  await store.ensureToday('2026-04-19');
  let state = await store.load();
  assert.equal(state.date, '2026-04-19');
  assert.equal(state.status, 'pending');
  assert.equal(store.canStartRun(state), true);

  await store.markRunning({ runId: 'r1' });
  await store.markSuccess({ runId: 'r1', summary: { personal: 'ok', leader: 'ok' } });
  state = await store.load();

  assert.equal(state.status, 'success');
  assert.equal(store.canStartRun(state), false);
});

test('StateStore should roll over to new day', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-checkin-test-'));
  const statePath = path.join(tmpDir, 'state.json');
  const store = new StateStore(statePath);

  await store.ensureToday('2026-04-18');
  await store.markRunning({ runId: 'old' });
  await store.markFailed({ runId: 'old', reason: 'network' });

  await store.ensureToday('2026-04-19');
  const state = await store.load();

  assert.equal(state.date, '2026-04-19');
  assert.equal(state.status, 'pending');
  assert.equal(state.runId, null);
});
