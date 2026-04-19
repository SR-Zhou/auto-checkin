import { checkCheckinCompleted, runCheckinWithRetries } from './automation/checkin-runner.js';
import { StateStore } from './infra/state-store.js';
import { buildFeishuText, sendFeishuText } from './notify/feishu.js';
import { todayKey } from './domain/time-window.js';

function makeRunId(dateKey) {
  const nonce = Math.random().toString(36).slice(2, 8);
  return `${dateKey}-${nonce}`;
}

async function notify(logger, config, { title, runId, status, details }) {
  const text = buildFeishuText({
    title,
    runId,
    status,
    details,
  });

  try {
    await sendFeishuText({
      webhookUrl: config.feishuWebhookUrl,
      text,
    });
    await logger.info('notify_sent', { run_id: runId, status });
  } catch (error) {
    await logger.error('notify_failed', { run_id: runId, status, error });
  }
}

export async function startService({ config, logger }) {
  const store = new StateStore(config.statePath);
  const dateKey = todayKey(new Date());
  let state = await store.ensureToday(dateKey);

  await logger.info('service_start', {
    mode: 'one_shot',
    timezone: config.timezone,
  });

  if (state.status === 'success') {
    const runId = state.runId || makeRunId(state.date);
    const summary = state.summary || { personal: 'already_done', leader: 'already_done' };

    await notify(logger, config, {
      title: '签到已完成（跳过执行）',
      runId,
      status: 'success',
      details: [
        `个人打卡: ${summary.personal}`,
        `小组长打卡: ${summary.leader}`,
      ],
    });

    await logger.info('workflow_finished', {
      run_id: runId,
      reason: 'state_already_success',
    });

    return {
      async stop() {
        await logger.info('service_stop', {});
      },
    };
  }

  const runId = makeRunId(state.date);

  try {
    const precheck = await checkCheckinCompleted({
      config,
      runId,
      logger,
    });

    if (precheck.completed) {
      await store.markSuccess({
        runId,
        summary: precheck.summary,
      });

      await notify(logger, config, {
        title: '签到已完成（无需执行）',
        runId,
        status: 'success',
        details: [
          `个人打卡: ${precheck.summary.personal}`,
          `小组长打卡: ${precheck.summary.leader}`,
        ],
      });

      await logger.info('workflow_finished', {
        run_id: runId,
        reason: 'precheck_completed',
      });

      return {
        async stop() {
          await logger.info('service_stop', {});
        },
      };
    }
  } catch (error) {
    await logger.warn('precheck_failed_continue', {
      run_id: runId,
      error,
    });
  }

  await store.markRunning({ runId });

  try {
    const result = await runCheckinWithRetries({
      config,
      runId,
      logger,
    });

    if (result.status === 'success') {
      await store.markSuccess({ runId, summary: result.summary });
      await notify(logger, config, {
        title: '签到成功',
        runId,
        status: 'success',
        details: [
          `个人打卡: ${result.summary.personal}`,
          `小组长打卡: ${result.summary.leader}`,
        ],
      });

      await logger.info('workflow_finished', {
        run_id: runId,
        reason: 'run_success',
      });
    } else {
      await store.markFailed({
        runId,
        reason: result.error?.message || '未知失败',
      });

      await notify(logger, config, {
        title: '签到失败',
        runId,
        status: 'failed',
        details: [
          `error: ${result.error?.message || 'unknown'}`,
          `attempts: ${result.attempts}`,
          `screenshot: ${result.error?.screenshotPath || 'none'}`,
        ],
      });

      await logger.info('workflow_finished', {
        run_id: runId,
        reason: 'run_failed',
      });
    }
  } catch (error) {
    await store.markFailed({
      runId,
      reason: error.message,
    });

    await notify(logger, config, {
      title: '签到失败（服务异常）',
      runId,
      status: 'failed',
      details: [`error: ${error.message}`],
    });

    await logger.error('run_crashed', {
      run_id: runId,
      error,
    });
  }

  return {
    async stop() {
      await logger.info('service_stop', {});
    },
  };
}
