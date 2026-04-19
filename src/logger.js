import fs from 'node:fs/promises';
import path from 'node:path';

function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    kind: error.kind,
    screenshotPath: error.screenshotPath,
  };
}

export function createLogger({ logPath }) {
  async function write(level, event, payload = {}) {
    const record = {
      ts: new Date().toISOString(),
      level,
      event,
      ...payload,
    };

    if (payload.error instanceof Error) {
      record.error = serializeError(payload.error);
    }

    const line = JSON.stringify(record);
    if (level === 'error') {
      console.error(line);
    } else {
      console.log(line);
    }

    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(logPath, line + '\n', 'utf8');
  }

  return {
    info(event, payload) {
      return write('info', event, payload);
    },
    warn(event, payload) {
      return write('warn', event, payload);
    },
    error(event, payload) {
      return write('error', event, payload);
    },
  };
}
