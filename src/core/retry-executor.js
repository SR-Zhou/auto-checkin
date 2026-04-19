export async function executeWithRetry({
  runAttempt,
  isRecoverable,
  maxAttempts,
  backoffMs,
  sleep,
}) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;

    try {
      const result = await runAttempt({ attempt: attempts });
      return {
        status: 'success',
        attempts,
        result,
      };
    } catch (error) {
      const recoverable = isRecoverable(error);
      const canRetry = attempts < maxAttempts;

      if (!recoverable) {
        return {
          status: 'failed',
          attempts,
          error,
        };
      }

      if (!canRetry) {
        return {
          status: 'failed',
          attempts,
          error,
        };
      }

      const waitMs = backoffMs({ attempt: attempts, error });
      await sleep(waitMs);
    }
  }

  return {
    status: 'failed',
    attempts,
    error: new Error('Max attempts exhausted'),
  };
}

export function computeBackoffMs({
  minMs,
  maxMs,
  random = Math.random,
}) {
  if (minMs > maxMs) {
    throw new Error('minMs cannot exceed maxMs');
  }
  const span = maxMs - minMs;
  return minMs + Math.floor(random() * (span + 1));
}
