import fs from 'node:fs/promises';
import path from 'node:path';

function defaultState(date) {
  return {
    date,
    status: 'pending',
    runId: null,
    attempts: 0,
    lastError: null,
    summary: null,
    updatedAt: new Date().toISOString(),
  };
}

export class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async save(state) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const next = { ...state, updatedAt: new Date().toISOString() };
    await fs.writeFile(this.filePath, JSON.stringify(next, null, 2) + '\n', 'utf8');
    return next;
  }

  async ensureToday(date) {
    const state = await this.load();
    if (!state || state.date !== date) {
      return this.save(defaultState(date));
    }
    return state;
  }

  canStartRun(state) {
    if (!state) return false;
    return state.status === 'pending';
  }

  async markRunning({ runId }) {
    const state = await this.load();
    if (!state) {
      throw new Error('State is not initialized. Call ensureToday first.');
    }
    return this.save({
      ...state,
      status: 'running',
      runId,
      attempts: state.attempts + 1,
      lastError: null,
    });
  }

  async markSuccess({ runId, summary }) {
    const state = await this.load();
    if (!state) {
      throw new Error('State is not initialized. Call ensureToday first.');
    }
    return this.save({
      ...state,
      status: 'success',
      runId,
      summary,
      lastError: null,
    });
  }

  async markFailed({ runId, reason }) {
    const state = await this.load();
    if (!state) {
      throw new Error('State is not initialized. Call ensureToday first.');
    }
    return this.save({
      ...state,
      status: 'failed',
      runId,
      lastError: reason,
    });
  }
}
