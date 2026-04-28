function asNonEmptyString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeAction(item, index, stepName) {
  if (!item || typeof item !== 'object') {
    throw new Error(`site config invalid submitSequence item: ${stepName}.submitSequence[${index}]`);
  }

  const selector = asNonEmptyString(item.selector);
  if (!selector) {
    throw new Error(
      `site config invalid submitSequence item: ${stepName}.submitSequence[${index}].selector`,
    );
  }

  const confirmSelector = asNonEmptyString(item.confirmSelector);
  const waitForSelector = asNonEmptyString(item.waitForSelector);

  let waitMs;
  if (item.waitMs !== undefined) {
    if (!Number.isInteger(item.waitMs) || item.waitMs < 0) {
      throw new Error(
        `site config invalid submitSequence item: ${stepName}.submitSequence[${index}].waitMs`,
      );
    }
    waitMs = item.waitMs;
  }

  const force = item.force === true;

  return {
    selector,
    confirmSelector,
    waitForSelector,
    waitMs,
    force,
  };
}

export function resolveSubmitActions(siteNode, stepName) {
  const submitSequence = Array.isArray(siteNode?.submitSequence) ? siteNode.submitSequence : [];

  if (submitSequence.length > 0) {
    return submitSequence.map((item, index) => normalizeAction(item, index, stepName));
  }

  const submitSelector = asNonEmptyString(siteNode?.submitSelector);
  if (submitSelector) {
    return [
      {
        selector: submitSelector,
        confirmSelector: asNonEmptyString(siteNode?.confirmSelector),
        waitForSelector: undefined,
        waitMs: undefined,
        force: false,
      },
    ];
  }

  throw new Error(`site config missing submit action: ${stepName}`);
}
