import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSubmitActions } from '../src/automation/submit-actions.js';

test('resolveSubmitActions should build action list from submitSequence', () => {
  const actions = resolveSubmitActions({
    submitSequence: [
      { selector: 'button.step-1' },
      { selector: 'button.step-2', confirmSelector: 'button.confirm-2' },
      { selector: 'button.step-3', waitMs: 500 },
    ],
  }, 'personal');

  assert.equal(actions.length, 3);
  assert.equal(actions[0].selector, 'button.step-1');
  assert.equal(actions[1].confirmSelector, 'button.confirm-2');
  assert.equal(actions[2].waitMs, 500);
});

test('resolveSubmitActions should fallback to single submitSelector', () => {
  const actions = resolveSubmitActions({
    submitSelector: 'button.submit',
    confirmSelector: 'button.confirm',
  }, 'leader');

  assert.equal(actions.length, 1);
  assert.equal(actions[0].selector, 'button.submit');
  assert.equal(actions[0].confirmSelector, 'button.confirm');
});

test('resolveSubmitActions should throw when submitSequence is invalid', () => {
  assert.throws(() => {
    resolveSubmitActions({
      submitSequence: [
        { selector: 'button.ok' },
        { notSelector: '.bad' },
      ],
    }, 'personal');
  }, /site config invalid submitSequence item: personal\.submitSequence\[1\]\.selector/);
});
