import test from 'node:test';
import assert from 'node:assert/strict';

import { RecoverableError, isRecoverable, normalizeError } from '../src/automation/errors.js';

test('isRecoverable should return false for recoverable error without retryable flag', () => {
  const error = new RecoverableError('generic recoverable');
  assert.equal(isRecoverable(error), false);
});

test('isRecoverable should return true only for retryable recoverable error', () => {
  const error = new RecoverableError('outcome missing', undefined, {
    retryable: true,
    reason: 'checkin_outcome_missing',
  });
  assert.equal(isRecoverable(error), true);
});

test('normalizeError should not mark unknown errors as retryable', () => {
  const error = normalizeError(new Error('net::ERR_CONNECTION_RESET'));
  assert.equal(isRecoverable(error), false);
});
