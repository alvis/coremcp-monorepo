import { describe, expect, it } from 'vitest';

import {
  computeRisk,
  computeScore,
  createPageReport,
  createSiteReport,
  slugify,
} from './report.mjs';

describe('design audit report helpers', () => {
  it('slugifies URLs safely', () => {
    expect(slugify('https://docs.coremcp.io/guide/intro')).toBe('docs-coremcp-io-guide-intro');
  });

  it('caps repeated penalties so a single rule does not dominate the score forever', () => {
    const repeatedIssues = Array.from({ length: 8 }, () => ({
      ruleId: 'target-size',
      severity: 'medium',
    }));

    expect(computeScore(repeatedIssues)).toBeGreaterThan(80);
  });

  it('elevates risk when high or blocking issues exist', () => {
    const risk = computeRisk([
      { ruleId: 'landmark-main', severity: 'high' },
      { ruleId: 'keyboard-trap', severity: 'medium', tags: ['blocking'] },
    ]);

    expect(risk.level).toBe('critical');
  });

  it('aggregates page and site reports', () => {
    const siteReport = createSiteReport({
      target: { type: 'url', input: 'https://example.com' },
      pages: [
        {
          url: 'https://example.com',
          title: 'Example',
          passes: [
            {
              name: 'desktop',
              issues: [
                { ruleId: 'heading-order', severity: 'medium', category: 'structure' },
                { ruleId: 'target-size', severity: 'low', category: 'interaction' },
              ],
            },
          ],
        },
      ],
    });

    expect(siteReport.summary.pageCount).toBe(1);
    expect(siteReport.pages[0].issueCount).toBe(2);
    expect(siteReport.pages[0].countsByCategory.structure).toBe(1);
  });

  it('deduplicates matching issues from the same pass', () => {
    const pageReport = createPageReport({
      url: 'https://example.com',
      passes: [
        {
          name: 'desktop',
          issues: [
            {
              ruleId: 'heading-order',
              severity: 'medium',
              category: 'structure',
              selector: 'h3',
              summary: 'Skipped from h1 to h3.',
            },
            {
              ruleId: 'heading-order',
              severity: 'medium',
              category: 'structure',
              selector: 'h3',
              summary: 'Skipped from h1 to h3.',
            },
          ],
        },
      ],
    });

    expect(pageReport.issueCount).toBe(1);
  });
});
