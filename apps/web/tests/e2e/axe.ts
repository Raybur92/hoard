import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Run axe-core against the current page and assert zero accessibility
 * violations at WCAG 2.1 A + AA. Use after a route has settled.
 *
 * Use disabledRules to opt out of specific checks where the violation
 * is a known false-positive or design exception (e.g., color-contrast on
 * the receipt block which uses a paper-on-receipt palette).
 */
export async function expectNoA11yViolations(
  page: Page,
  options: { disabledRules?: string[] } = {},
) {
  const builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (options.disabledRules?.length) {
    builder.disableRules(options.disabledRules);
  }
  const results = await builder.analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}
