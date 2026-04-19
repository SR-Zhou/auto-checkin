import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFeishuText } from '../src/notify/feishu.js';

test('buildFeishuText should include run id and summary', () => {
  const text = buildFeishuText({
    title: '签到成功',
    runId: 'run-123',
    status: 'success',
    details: ['个人打卡: success', '小组长打卡: success'],
  });

  assert.match(text, /签到成功/);
  assert.match(text, /run-123/);
  assert.match(text, /个人打卡/);
  assert.match(text, /小组长打卡/);
});
