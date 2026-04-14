const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

const SEVERITY_WEIGHTS = {
  critical: 22,
  high: 14,
  medium: 8,
  low: 4,
  info: 0,
};

const SEVERITY_CAPS = {
  critical: 24,
  high: 18,
  medium: 12,
  low: 6,
  info: 0,
};

export function normalizeSeverity(value) {
  return SEVERITY_ORDER.includes(value) ? value : 'medium';
}

export function severityRank(value) {
  return SEVERITY_ORDER.indexOf(normalizeSeverity(value));
}

export function slugify(value) {
  return String(value || 'audit')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'audit';
}

function penaltyForOccurrences(severity, occurrences) {
  const normalizedSeverity = normalizeSeverity(severity);
  const baseWeight = SEVERITY_WEIGHTS[normalizedSeverity];
  const maxPenalty = SEVERITY_CAPS[normalizedSeverity];
  let penalty = 0;

  for (let index = 0; index < occurrences; index += 1) {
    penalty += baseWeight / (1 + index * 0.7);
  }

  return Math.min(maxPenalty, penalty);
}

export function computeScore(issues) {
  const issuesByCategory = new Map();

  for (const issue of issues) {
    const category = issue.category || 'uncategorized';
    const categoryIssues = issuesByCategory.get(category) ?? [];
    categoryIssues.push(issue);
    issuesByCategory.set(category, categoryIssues);
  }

  if (issuesByCategory.size === 0) return 100;

  const categoryScores = Array.from(issuesByCategory.values()).map((categoryIssues) => {
    const penaltiesByRule = new Map();

    for (const issue of categoryIssues) {
      const ruleId = issue.ruleId || 'unknown-rule';
      const current = penaltiesByRule.get(ruleId) ?? {
        occurrences: 0,
        severity: normalizeSeverity(issue.severity),
      };

      current.occurrences += 1;

      if (severityRank(issue.severity) < severityRank(current.severity)) {
        current.severity = normalizeSeverity(issue.severity);
      }

      penaltiesByRule.set(ruleId, current);
    }

    const penalty = Array.from(penaltiesByRule.values()).reduce(
      (total, entry) => total + penaltyForOccurrences(entry.severity, entry.occurrences),
      0,
    );

    return Math.max(0, Math.round(100 - Math.min(45, penalty)));
  });

  return Math.round(categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length);
}

export function countBy(items, getKey) {
  const counts = {};

  for (const item of items) {
    const key = getKey(item);
    counts[key] = (counts[key] || 0) + 1;
  }

  return counts;
}

export function computeRisk(issues) {
  const counts = countBy(issues, (issue) => normalizeSeverity(issue.severity));
  const blockingIssues = issues.filter((issue) => issue.tags?.includes('blocking'));
  const criticalCount = counts.critical || 0;
  const highCount = counts.high || 0;
  const mediumCount = counts.medium || 0;
  const lowCount = counts.low || 0;

  let level = 'low';

  if (criticalCount >= 1 || highCount >= 4 || blockingIssues.length >= 1) {
    level = 'critical';
  } else if (highCount >= 1 || mediumCount >= 6) {
    level = 'high';
  } else if (mediumCount >= 1 || lowCount >= 4) {
    level = 'medium';
  }

  return {
    level,
    blockingIssueCount: blockingIssues.length,
    counts,
    summary:
      level === 'critical'
        ? 'Critical design issues are blocking usability or accessibility.'
        : level === 'high'
          ? 'High-severity design issues need attention before wider rollout.'
          : level === 'medium'
            ? 'Design debt is present but not broadly blocking.'
            : 'No major blocking design issues were detected.',
  };
}

export function sortIssues(issues) {
  return [...issues].sort((left, right) => {
    const severityDiff = severityRank(left.severity) - severityRank(right.severity);
    if (severityDiff !== 0) return severityDiff;

    const leftRule = left.ruleId || '';
    const rightRule = right.ruleId || '';
    if (leftRule !== rightRule) return leftRule.localeCompare(rightRule);

    return (left.selector || '').localeCompare(right.selector || '');
  });
}

function dedupeIssues(issues) {
  const seen = new Set();
  const deduped = [];

  for (const issue of issues) {
    const key = [
      issue.viewport || 'default',
      issue.ruleId || 'unknown-rule',
      issue.selector || '',
      issue.summary || issue.details || '',
    ].join('::');

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(issue);
  }

  return deduped;
}

function dedupeManualReview(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = [
      item.viewport || 'default',
      item.selector || '',
      item.summary || '',
      item.reason || '',
    ].join('::');

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function collectManualReviewEntries(page) {
  const entries = page.passes.flatMap((pass) =>
    Object.values(pass.categories || {}).flatMap((category) =>
      (category.manualReview || []).map((entry) => ({
        ...entry,
        viewport: entry.viewport || pass.name,
        category: entry.category || category.auditId || 'manual-review',
      })),
    ),
  );

  return dedupeManualReview(entries);
}

export function createPageReport(page) {
  const issues = dedupeIssues(
    page.passes.flatMap((pass) =>
      pass.issues.map((issue) => ({
        ...issue,
        viewport: issue.viewport || pass.name,
      })),
    ),
  );
  const sortedIssues = sortIssues(issues);
  const countsBySeverity = countBy(sortedIssues, (issue) => normalizeSeverity(issue.severity));
  const countsByCategory = countBy(sortedIssues, (issue) => issue.category || 'uncategorized');
  const countsByRuleId = countBy(sortedIssues, (issue) => issue.ruleId || 'unknown-rule');
  const score = computeScore(sortedIssues);
  const risk = computeRisk(sortedIssues);
  const manualReview = collectManualReviewEntries(page);

  return {
    url: page.url,
    title: page.title || page.passes.find((pass) => pass.title)?.title || page.url,
    score,
    risk,
    issueCount: sortedIssues.length,
    countsBySeverity,
    countsByCategory,
    countsByRuleId,
    topIssues: sortedIssues.slice(0, 12),
    manualReview,
    passes: page.passes,
    issues: sortedIssues,
  };
}

export function createSiteReport({ target, pages, metadata = {} }) {
  const pageReports = pages.map(createPageReport);
  const allIssues = pageReports.flatMap((page) => page.issues);
  const averageScore =
    pageReports.length > 0
      ? Math.round(pageReports.reduce((sum, page) => sum + page.score, 0) / pageReports.length)
      : 100;

  const countsBySeverity = countBy(allIssues, (issue) => normalizeSeverity(issue.severity));
  const countsByCategory = countBy(allIssues, (issue) => issue.category || 'uncategorized');
  const countsByRuleId = countBy(allIssues, (issue) => issue.ruleId || 'unknown-rule');
  const risk = computeRisk(allIssues);
  const manualReview = pageReports.flatMap((page) =>
    page.manualReview.map((entry) => ({
      ...entry,
      url: page.url,
      title: page.title,
    })),
  );

  return {
    contractVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    target,
    metadata,
    summary: {
      pageCount: pageReports.length,
      averageScore,
      risk,
      issueCount: allIssues.length,
      countsBySeverity,
      countsByCategory,
      countsByRuleId,
      manualReviewCount: manualReview.length,
      worstPages: [...pageReports]
        .sort((left, right) => left.score - right.score || right.issueCount - left.issueCount)
        .slice(0, 10)
        .map((page) => ({
          url: page.url,
          title: page.title,
          score: page.score,
          risk: page.risk.level,
          issueCount: page.issueCount,
        })),
    },
    manualReview,
    pages: pageReports,
  };
}
