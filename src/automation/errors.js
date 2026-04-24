export class RecoverableError extends Error {
  constructor(message, cause, options = {}) {
    super(message);
    this.name = 'RecoverableError';
    this.kind = 'recoverable';
    this.cause = cause;
    this.retryable = Boolean(options.retryable);
    this.reason = options.reason || null;
  }
}

export class FatalError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'FatalError';
    this.kind = 'fatal';
    this.cause = cause;
  }
}

export function isRecoverable(error) {
  return Boolean(error?.kind === 'recoverable' && error?.retryable === true);
}

export function normalizeError(error) {
  if (error?.kind === 'recoverable' || error?.kind === 'fatal') {
    return error;
  }

  const msg = String(error?.message || 'Unknown error');

  if (error?.name === 'TimeoutError' || msg.includes('net::ERR') || msg.includes('ECONNRESET')) {
    return new RecoverableError(msg, error);
  }

  return new RecoverableError(msg, error);
}
