import test from 'node:test';
import assert from 'node:assert/strict';

import { executeWithRetry } from '../src/core/retry-executor.js';

test('executeWithRetry retries recoverable errors until success', async () => {
  let attempts = 0;

  const result = await executeWithRetry({
    runAttempt: async () => {
      attempts += 1;
      if (attempts < 3) {
        const e = new Error('timeout');
        e.kind = 'recoverable';
        throw e;
      }
      return { ok: true };
    },
    isRecoverable: (error) => error.kind === 'recoverable',
    maxAttempts: 3,
    backoffMs: () => 1,
    sleep: async () => {},
  });

  assert.equal(result.status, 'success');
  assert.equal(result.attempts, 3);
  assert.deepEqual(result.result, { ok: true });
});

test('executeWithRetry stops immediately for fatal errors', async () => {
  const result = await executeWithRetry({
    runAttempt: async () => {
      const e = new Error('selector missing');
      e.kind = 'fatal';
      throw e;
    },
    isRecoverable: (error) => error.kind === 'recoverable',
    maxAttempts: 3,
    backoffMs: () => 1,
    sleep: async () => {},
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.attempts, 1);
  assert.match(result.error.message, /selector missing/);
});

test('executeWithRetry returns failed when recoverable errors exhaust retries', async () => {
  let attempts = 0;
  const result = await executeWithRetry({
    runAttempt: async () => {
      attempts += 1;
      const e = new Error('network');
      e.kind = 'recoverable';
      throw e;
    },
    isRecoverable: (error) => error.kind === 'recoverable',
    maxAttempts: 3,
    backoffMs: () => 1,
    sleep: async () => {},
  });

  assert.equal(result.status, 'failed');
  assert.equal(attempts, 3);
});
