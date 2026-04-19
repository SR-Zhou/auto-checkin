export class RecoverableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'RecoverableError';
    this.kind = 'recoverable';
    this.cause = cause;
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
  return Boolean(error?.kind === 'recoverable');
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
