import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

import { computeBackoffMs, executeWithRetry } from '../core/retry-executor.js';
import { sleep } from '../utils/sleep.js';
import { FatalError, RecoverableError, isRecoverable, normalizeError } from './errors.js';
import { resolveSubmitActions } from './submit-actions.js';

function slug(value) {
  return String(value).replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60);
}

async function selectorVisible(page, selector, timeout = 1200) {
  if (!selector) return false;
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function expectVisible(page, selector, label, timeout = 12_000) {
  if (!selector) {
    throw new FatalError(`缺少必要选择器: ${label}`);
  }

  try {
    await page.waitForSelector(selector, { state: 'visible', timeout });
  } catch (error) {
    throw new FatalError(`未找到必要元素(${label})，疑似页面结构变更`, error);
  }
}

async function gotoPage(page, url, label) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    throw new RecoverableError(`访问页面失败(${label}): ${url}`, error);
  }
}

async function captureFailureScreenshot({ page, screenshotDir, runId, attempt, step }) {
  if (!page || page.isClosed()) {
    return null;
  }

  await fs.mkdir(screenshotDir, { recursive: true });
  const filename = `${slug(runId)}-a${attempt}-${slug(step)}-${Date.now()}.png`;
  const fullPath = path.join(screenshotDir, filename);

  try {
    await page.screenshot({ path: fullPath, fullPage: true });
    return fullPath;
  } catch {
    return null;
  }
}

async function ensureLoggedIn({ page, config, logger, runId }) {
  const { site, username, password, browser } = config;
  const auth = site.auth || {};

  await logger.info('login_navigating', { run_id: runId });
  await gotoPage(page, site.login.url, 'login');

  if (await selectorVisible(page, auth.loggedInSelector, 1500)) {
    await logger.info('login_skip_already_logged_in', { run_id: runId });
    return 'already_logged_in';
  }

  await expectVisible(page, site.login.usernameSelector, 'login.usernameSelector', browser.timeoutMs);
  await expectVisible(page, site.login.passwordSelector, 'login.passwordSelector', browser.timeoutMs);
  await expectVisible(page, site.login.submitSelector, 'login.submitSelector', browser.timeoutMs);

  await logger.info('login_submitting_form', { run_id: runId });
  await page.fill(site.login.usernameSelector, username);
  await page.fill(site.login.passwordSelector, password);
  await page.click(site.login.submitSelector);

  await logger.info('login_waiting_network', { run_id: runId });
  await page.waitForLoadState('networkidle', { timeout: browser.timeoutMs }).catch(() => {});

  if (await selectorVisible(page, auth.loginErrorSelector, 1200)) {
    throw new FatalError('登录失败：检测到登录错误提示，请检查账号密码');
  }

  if (auth.loginFailedPattern) {
    const bodyText = (await page.textContent('body')) || '';
    const failed = new RegExp(auth.loginFailedPattern, 'i').test(bodyText);
    if (failed) {
      throw new FatalError('登录失败：匹配到登录失败文案，请检查账号密码');
    }
  }

  if (auth.loggedInSelector) {
    const loggedIn = await selectorVisible(page, auth.loggedInSelector, browser.timeoutMs);
    if (!loggedIn) {
      throw new RecoverableError('登录后未检测到已登录标记');
    }
  } else {
    const stillOnLogin = await selectorVisible(page, site.login.usernameSelector, 2000);
    if (stillOnLogin) {
      throw new FatalError('登录后仍停留在登录页，疑似凭据错误或页面结构变化');
    }
  }

  await logger.info('login_success', { run_id: runId });
  return 'logged_in';
}

async function waitCheckinOutcome({
  page,
  alreadyDoneSelector,
  successSelector,
  timeoutMs,
}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const [isAlreadyDone, isSuccess] = await Promise.all([
      selectorVisible(page, alreadyDoneSelector, 400),
      successSelector ? selectorVisible(page, successSelector, 400) : Promise.resolve(false),
    ]);

    if (isAlreadyDone) {
      return 'already_done';
    }

    if (isSuccess) {
      return 'submitted';
    }

    await sleep(300);
  }

  if (!successSelector && (await selectorVisible(page, alreadyDoneSelector, 1200))) {
    return 'submitted';
  }

  throw new RecoverableError('提交后未检测到成功状态', undefined, {
    retryable: true,
    reason: 'checkin_outcome_missing',
  });
}

async function runCheckinStep({
  page,
  runId,
  logger,
  siteNode,
  stepName,
  browserTimeoutMs,
  actionBufferMs,
}) {
  await logger.info('checkin_step_navigating', { run_id: runId, step: stepName, url: siteNode.url });
  await gotoPage(page, siteNode.url, stepName);

  const submitActions = resolveSubmitActions(siteNode, stepName);

  for (let i = 0; i < submitActions.length; i += 1) {
    const action = submitActions[i];
    const actionLabel = `${stepName}.submitSequence[${i}]`;

    if (actionBufferMs > 0) {
      await sleep(actionBufferMs);
    }

    await expectVisible(page, action.selector, `${actionLabel}.selector`, browserTimeoutMs);
    await page.click(action.selector);

    if (action.confirmSelector && (await selectorVisible(page, action.confirmSelector, 1500))) {
      await page.click(action.confirmSelector);
    }

    if (action.waitForSelector) {
      await expectVisible(
        page,
        action.waitForSelector,
        `${actionLabel}.waitForSelector`,
        browserTimeoutMs,
      );
    }

    if (action.waitMs && action.waitMs > 0) {
      await sleep(action.waitMs);
    }
  }

  const outcome = await waitCheckinOutcome({
    page,
    alreadyDoneSelector: siteNode.alreadyDoneSelector,
    successSelector: siteNode.successSelector,
    timeoutMs: browserTimeoutMs,
  });

  await logger.info('checkin_step_done', { run_id: runId, step: stepName, outcome });
  return { step: stepName, status: outcome };
}

async function checkStepDoneOnly({ page, runId, logger, siteNode, stepName }) {
  await gotoPage(page, siteNode.url, stepName);
  const done = await selectorVisible(page, siteNode.alreadyDoneSelector, 1500);
  const status = done ? 'already_done' : 'not_done';
  await logger.info('checkin_precheck', {
    run_id: runId,
    step: stepName,
    status,
  });
  return { step: stepName, status };
}

async function runSingleAttempt({ config, runId, attempt, logger }) {
  await logger.info('attempt_browser_launching', { run_id: runId, attempt });
  const browser = await chromium.launch({
    headless: config.browser.headless,
    slowMo: config.browser.slowMoMs,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  await logger.info('attempt_browser_launched', { run_id: runId, attempt });

  let page = null;

  try {
    const context = await browser.newContext();
    page = await context.newPage();
    page.setDefaultTimeout(config.browser.timeoutMs);

    await logger.info('attempt_start', {
      run_id: runId,
      attempt,
    });

    await ensureLoggedIn({ page, config, logger, runId });

    const personal = await runCheckinStep({
      page,
      runId,
      logger,
      siteNode: config.site.personal,
      stepName: 'personal',
      browserTimeoutMs: config.browser.timeoutMs,
      actionBufferMs: config.browser.actionBufferMs,
    });

    const leader = await runCheckinStep({
      page,
      runId,
      logger,
      siteNode: config.site.leader,
      stepName: 'leader',
      browserTimeoutMs: config.browser.timeoutMs,
      actionBufferMs: config.browser.actionBufferMs,
    });

    return {
      personal,
      leader,
    };
  } catch (error) {
    const normalized = normalizeError(error);
    const screenshotPath = await captureFailureScreenshot({
      page,
      screenshotDir: config.screenshotDir,
      runId,
      attempt,
      step: 'attempt_failed',
    });

    if (screenshotPath) {
      normalized.screenshotPath = screenshotPath;
    }

    throw normalized;
  } finally {
    await browser.close();
  }
}

export async function runCheckinWithRetries({
  config,
  runId,
  logger,
}) {
  const result = await executeWithRetry({
    runAttempt: ({ attempt }) => runSingleAttempt({ config, runId, attempt, logger }),
    isRecoverable,
    maxAttempts: 1, // Fail immediately without retry
    backoffMs: () =>
      computeBackoffMs({
        minMs: config.retry.backoffMinMs,
        maxMs: config.retry.backoffMaxMs,
      }),
    sleep,
  });

  if (result.status !== 'success') {
    await logger.warn('run_failed', {
      run_id: runId,
      status: result.status,
      attempts: result.attempts,
      error: result.error,
      screenshot_path: result.error?.screenshotPath,
    });
    return result;
  }

  await logger.info('run_success', {
    run_id: runId,
    attempts: result.attempts,
    leader: result.result.leader.status,
  });

  return {
    ...result,
    summary: {
      leader: result.result.leader.status,
    },
  };
}

export async function checkCheckinCompleted({
  config,
  runId,
  logger,
}) {
  await logger.info('precheck_start', { run_id: runId });
  await logger.info('browser_launching', { run_id: runId });
  const browser = await chromium.launch({
    headless: config.browser.headless,
    slowMo: config.browser.slowMoMs,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  await logger.info('browser_launched', { run_id: runId });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(config.browser.timeoutMs);

    await ensureLoggedIn({ page, config, logger, runId });

    const leader = await checkStepDoneOnly({
      page,
      runId,
      logger,
      siteNode: config.site.leader,
      stepName: 'leader',
    });

    return {
      completed: leader.status === 'already_done',
      summary: {
        leader: leader.status,
      },
    };
  } finally {
    await browser.close();
  }
}
