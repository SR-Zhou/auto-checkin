import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildConfig } from '../src/config.js';

async function createSiteConfig(tmpDir, overrides = {}) {
  const sitePath = path.join(tmpDir, 'site-config.json');
  const data = {
    login: {
      url: '/login',
      usernameSelector: '#username',
      passwordSelector: '#password',
      submitSelector: 'button[type="submit"]'
    },
    personal: {
      url: '/personal',
      alreadyDoneSelector: '.personal-done',
      submitSelector: '.personal-submit',
    },
    leader: {
      url: '/leader',
      alreadyDoneSelector: '.leader-done',
      submitSelector: '.leader-submit'
    },
    auth: {
      loggedInSelector: '.user-profile'
    }
  };
  const merged = {
    ...data,
    ...overrides,
    personal: {
      ...data.personal,
      ...(overrides.personal || {}),
    },
    leader: {
      ...data.leader,
      ...(overrides.leader || {}),
    },
  };

  await fs.writeFile(sitePath, JSON.stringify(merged, null, 2));
  return sitePath;
}

test('buildConfig should parse required env and site config', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-checkin-config-'));
  const sitePath = await createSiteConfig(tmpDir);

  const config = await buildConfig({
    env: {
      TARGET_URL: 'https://demo.example.com',
      CHECKIN_USERNAME: 'u1',
      CHECKIN_PASSWORD: 'p1',
      TIMEZONE: 'Asia/Shanghai',
      SITE_CONFIG_PATH: sitePath,
    },
  });

  assert.equal(config.targetUrl, 'https://demo.example.com');
  assert.equal(config.timezone, 'Asia/Shanghai');
  assert.equal(config.site.login.url, 'https://demo.example.com/login');
  assert.equal(config.site.personal.url, 'https://demo.example.com/personal');
  assert.equal(config.site.leader.url, 'https://demo.example.com/leader');
  assert.equal(config.site.login.usernameSelector, '#username');
  assert.equal('statePath' in config, false);
  assert.equal(config.retry.maxAttempts, 3);
  assert.equal(config.browser.actionBufferMs, 1500);
});

test('buildConfig should fail when required env is missing', async () => {
  await assert.rejects(() =>
    buildConfig({
      env: {
        TARGET_URL: 'https://demo.example.com',
      },
    }),
  /Missing required environment variable: CHECKIN_USERNAME/);
});

test('buildConfig should accept submitSequence for personal step', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-checkin-config-'));
  const sitePath = await createSiteConfig(tmpDir, {
    personal: {
      submitSelector: undefined,
      submitSequence: [
        { selector: 'button.step-1' },
        { selector: 'button.step-2' },
        { selector: 'button.step-3' },
      ],
    },
  });

  const config = await buildConfig({
    env: {
      TARGET_URL: 'https://demo.example.com',
      CHECKIN_USERNAME: 'u1',
      CHECKIN_PASSWORD: 'p1',
      SITE_CONFIG_PATH: sitePath,
    },
  });

  assert.equal(config.site.personal.submitSequence.length, 3);
  assert.equal(config.site.personal.submitSequence[2].selector, 'button.step-3');
});

test('buildConfig should fail when no submit selector and no submitSequence', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-checkin-config-'));
  const sitePath = await createSiteConfig(tmpDir, {
    personal: {
      submitSelector: undefined,
    },
  });

  await assert.rejects(() =>
    buildConfig({
      env: {
        TARGET_URL: 'https://demo.example.com',
        CHECKIN_USERNAME: 'u1',
        CHECKIN_PASSWORD: 'p1',
        SITE_CONFIG_PATH: sitePath,
      },
    }),
  /site config missing submit action: personal/);
});

test('buildConfig should parse CHECKIN_ACTION_BUFFER_MS override', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-checkin-config-'));
  const sitePath = await createSiteConfig(tmpDir);

  const config = await buildConfig({
    env: {
      TARGET_URL: 'https://demo.example.com',
      CHECKIN_USERNAME: 'u1',
      CHECKIN_PASSWORD: 'p1',
      SITE_CONFIG_PATH: sitePath,
      CHECKIN_ACTION_BUFFER_MS: '2800',
    },
  });

  assert.equal(config.browser.actionBufferMs, 2800);
});
