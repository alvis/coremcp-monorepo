/**
 * Complete design audit aggregator for rendered pages.
 *
 * This script expects the module scripts to be loaded first:
 * - wcag-text-audit.js
 * - semantic-structure-audit.js
 * - interaction-audit.js
 * - mobile-layout-audit.js
 * - visual-layout-audit.js
 */

function runDesignAudit(options = {}) {
  const settings = {
    categories: ['text', 'structure', 'interaction', 'mobile', 'visual'],
    quiet: false,
    text: {},
    structure: {},
    interaction: {},
    mobile: {},
    ...options,
  };

  const textIssueMeta = {
    contrast: {
      ruleId: 'text-contrast',
      title: 'Insufficient text contrast',
      category: 'text',
      tags: ['wcag', 'contrast'],
      wcagCriteria: ['1.4.3'],
    },
    'collapsed-width': {
      ruleId: 'collapsed-width',
      title: 'Overly narrow reading measure',
      category: 'text',
      tags: ['readability', 'layout'],
      wcagCriteria: [],
    },
    'narrow-heading-width': {
      ruleId: 'narrow-heading-width',
      title: 'Heading is constrained to a narrow column',
      category: 'text',
      tags: ['readability', 'hierarchy'],
      wcagCriteria: ['2.4.6'],
    },
    'tight-frame-spacing': {
      ruleId: 'tight-frame-spacing',
      title: 'Text is cramped inside its container',
      category: 'text',
      tags: ['spacing', 'readability'],
      wcagCriteria: [],
    },
    'tight-label-spacing': {
      ruleId: 'tight-label-spacing',
      title: 'Label spacing is too tight',
      category: 'text',
      tags: ['spacing', 'controls'],
      wcagCriteria: [],
    },
    'control-height-too-small': {
      ruleId: 'control-min-height',
      title: 'Control height is too small',
      category: 'interaction',
      tags: ['controls', 'mobile'],
      wcagCriteria: ['2.5.8'],
    },
    'cramped-pill-aspect': {
      ruleId: 'control-pill-aspect',
      title: 'Pill control is visually cramped',
      category: 'interaction',
      tags: ['controls', 'layout'],
      wcagCriteria: [],
    },
    'cramped-search-width': {
      ruleId: 'search-min-width',
      title: 'Search control is too narrow',
      category: 'interaction',
      tags: ['search', 'layout'],
      wcagCriteria: [],
    },
    'inconsistent-control-heights': {
      ruleId: 'navbar-control-height-consistency',
      title: 'Navbar controls are inconsistent in height',
      category: 'interaction',
      tags: ['navigation', 'consistency'],
      wcagCriteria: [],
    },
  };

  const countBy = (items, getKey) =>
    items.reduce((accumulator, item) => {
      const key = getKey(item);
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

  const severityRank = (severity) =>
    ({ critical: 0, high: 1, medium: 2, low: 3, info: 4 }[severity] ?? 2);

  const computeScore = (issues) => {
    const issuesByCategory = new Map();

    for (const issue of issues) {
      const category = issue.category || 'uncategorized';
      const categoryIssues = issuesByCategory.get(category) || [];
      categoryIssues.push(issue);
      issuesByCategory.set(category, categoryIssues);
    }

    if (issuesByCategory.size === 0) return 100;

    const categoryScores = Array.from(issuesByCategory.values()).map((categoryIssues) => {
      const uniqueRules = new Map();

      for (const issue of categoryIssues) {
        const key = issue.ruleId || issue.title || 'unknown-rule';
        const current = uniqueRules.get(key);
        const currentRank = severityRank(issue.severity);

        if (!current || currentRank < severityRank(current.severity)) {
          uniqueRules.set(key, {
            severity: issue.severity,
            count: (current?.count || 0) + 1,
          });
        } else {
          current.count += 1;
        }
      }

      const penalty = Array.from(uniqueRules.values()).reduce((sum, entry) => {
        const weight = { critical: 22, high: 14, medium: 8, low: 4, info: 0 }[entry.severity] || 8;
        return sum + Math.min(weight * 1.6, weight + (entry.count - 1) * (weight * 0.35));
      }, 0);

      return Math.max(0, Math.round(100 - Math.min(45, penalty)));
    });

    return Math.round(categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length);
  };

  const computeRiskLevel = (issues) => {
    const counts = countBy(issues, (issue) => issue.severity || 'medium');

    if ((counts.critical || 0) >= 1 || (counts.high || 0) >= 4) return 'critical';
    if ((counts.high || 0) >= 1 || (counts.medium || 0) >= 6) return 'high';
    if ((counts.medium || 0) >= 1 || (counts.low || 0) >= 4) return 'medium';
    return 'low';
  };

  const normalizeTextIssues = (textReport) => {
    const issues = [];

    for (const issue of textReport.issues || []) {
      const meta = textIssueMeta[issue.issueType] || {
        ruleId: issue.issueType || 'text-issue',
        title: 'Text presentation issue',
        category: 'text',
        tags: ['text'],
        wcagCriteria: [],
      };

      issues.push({
        category: meta.category,
        ruleId: meta.ruleId,
        severity: issue.severity || 'medium',
        title: meta.title,
        summary: issue.details,
        details: issue.details,
        selector: issue.selector || null,
        tags: meta.tags,
        wcagCriteria: meta.wcagCriteria,
        evidence: {
          text: issue.text,
          contrast: issue.contrast,
          minimum: issue.minimum,
          lineCount: issue.lineCount,
          minFrameClearance: issue.minFrameClearance,
        },
      });
    }

    return {
      auditId: 'text',
      label: 'Text readability',
      issueCount: issues.length,
      issues,
      stats: {
        totalTextElements: textReport.totalTextElements,
        failingTextElements: textReport.failingTextElements,
        manualReviewTextElements: textReport.manualReviewTextElements,
        manualReview: (textReport.manualReview || []).map((issue) => ({
          category: 'text',
          ruleId: 'complex-surface-manual-review',
          severity: 'info',
          title: 'Complex visual surface needs manual review',
          summary: 'Layered surfaces make automatic text analysis unreliable.',
          details: `Text appears on a complex surface: ${(issue.complexSurfaceReasons || []).join(', ')}`,
          selector: issue.selector || null,
          tags: ['manual-review', 'text'],
          wcagCriteria: [],
          manualReview: true,
          evidence: {
            text: issue.text,
            estimatedContrast: issue.estimatedContrast,
            reasons: issue.complexSurfaceReasons || [],
          },
        })),
      },
      source: textReport,
    };
  };

  const categories = {};
  const issues = [];

  if (settings.categories.includes('text') && typeof window.runWcagTextAudit === 'function') {
    const report = normalizeTextIssues(
      window.runWcagTextAudit({
        quiet: true,
        ...settings.text,
      }),
    );
    categories.text = report;
    issues.push(...report.issues);
  }

  if (settings.categories.includes('structure') && typeof window.runSemanticStructureAudit === 'function') {
    const report = window.runSemanticStructureAudit({
      quiet: true,
      ...settings.structure,
    });
    categories.structure = report;
    issues.push(...report.issues);
  }

  if (settings.categories.includes('interaction') && typeof window.runInteractionAudit === 'function') {
    const report = window.runInteractionAudit({
      quiet: true,
      ...settings.interaction,
    });
    categories.interaction = report;
    issues.push(...report.issues);
  }

  if (settings.categories.includes('mobile') && typeof window.runMobileLayoutAudit === 'function') {
    const report = window.runMobileLayoutAudit({
      quiet: true,
      ...settings.mobile,
    });
    categories.mobile = report;
    issues.push(...report.issues);
  }

  if (settings.categories.includes('visual') && typeof window.runVisualLayoutAudit === 'function') {
    const report = window.runVisualLayoutAudit({
      quiet: true,
      ...settings.visual,
    });
    categories.visual = report;
    issues.push(...report.issues);
  }

  const sortedIssues = [...issues].sort((left, right) => {
    const severityDiff = severityRank(left.severity) - severityRank(right.severity);
    if (severityDiff !== 0) return severityDiff;
    return (left.ruleId || '').localeCompare(right.ruleId || '');
  });

  const report = {
    auditId: 'design',
    contractVersion: '1.0.0',
    url: window.location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    categories,
    issues: sortedIssues,
    summary: {
      score: computeScore(sortedIssues),
      riskLevel: computeRiskLevel(sortedIssues),
      issueCount: sortedIssues.length,
      countsBySeverity: countBy(sortedIssues, (issue) => issue.severity || 'medium'),
      countsByCategory: countBy(sortedIssues, (issue) => issue.category || 'uncategorized'),
      countsByRuleId: countBy(sortedIssues, (issue) => issue.ruleId || 'unknown-rule'),
      topIssues: sortedIssues.slice(0, 12),
    },
  };

  if (!settings.quiet) {
    console.groupCollapsed(
      `[Design Audit] score ${report.summary.score}, ${report.summary.issueCount} issue(s), risk ${report.summary.riskLevel}`,
    );
    console.table(report.summary.topIssues);
    console.groupEnd();
  }

  return report;
}

window.runDesignAudit = runDesignAudit;
