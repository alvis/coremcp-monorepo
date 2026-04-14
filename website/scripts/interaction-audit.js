/**
 * Interaction and action clarity audit for rendered pages.
 */

function runInteractionAudit(options = {}) {
  const settings = {
    maxIssues: 200,
    ignoreSelectors: [],
    minTargetSize: 44,
    maxGenericLabelOccurrences: 2,
    ...options,
  };

  const ignoredSelectors = settings.ignoreSelectors.filter(Boolean);

  const matchesIgnoredSelector = (element) =>
    ignoredSelectors.some((selector) => element?.matches?.(selector) || element?.closest?.(selector));

  const getSelectorHint = (element) => {
    if (!element) return null;
    if (element.id) return `#${element.id}`;

    const classNames = Array.from(element.classList || []).slice(0, 3);
    if (classNames.length > 0) return `${element.tagName.toLowerCase()}.${classNames.join('.')}`;

    return element.tagName.toLowerCase();
  };

  const getVisibleText = (element) =>
    (element.innerText || element.textContent || element.getAttribute('aria-label') || '')
      .trim()
      .replace(/\s+/g, ' ');

  const getRenderedBox = (element) => {
    const rect = element.getBoundingClientRect();
    const width = Math.max(rect.width, element.offsetWidth || 0, element.clientWidth || 0);
    const height = Math.max(rect.height, element.offsetHeight || 0, element.clientHeight || 0);

    return {
      rect,
      width,
      height,
    };
  };

  const isOnScreen = (rect) =>
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth;

  const issues = [];

  const pushIssue = (issue) => {
    if (issues.length >= settings.maxIssues) return;
    issues.push(issue);
  };

  const createIssue = ({
    ruleId,
    severity,
    title,
    summary,
    details,
    selector = null,
    tags = [],
    wcagCriteria = [],
    evidence = {},
  }) => ({
    category: 'interaction',
    ruleId,
    severity,
    title,
    summary,
    details,
    selector,
    tags,
    wcagCriteria,
    evidence,
  });

  const interactiveElements = Array.from(
    document.querySelectorAll(
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => {
    if (matchesIgnoredSelector(element)) return false;
    const style = getComputedStyle(element);
    const { rect, width, height } = getRenderedBox(element);

    return (
      width >= 8 &&
      height >= 8 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      Number.parseFloat(style.opacity || '1') > 0 &&
      style.pointerEvents !== 'none' &&
      isOnScreen(rect)
    );
  });

  for (const element of interactiveElements) {
    const style = getComputedStyle(element);
    const { width, height } = getRenderedBox(element);
    const minDimension = Math.min(width, height);
    const shortfall = settings.minTargetSize - minDimension;
    const isLinkLike = element.tagName === 'A' || element.getAttribute('role') === 'link';
    const hasVisualChrome =
      style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
      ['solid', 'dashed', 'double'].includes(style.borderTopStyle) ||
      Number.parseFloat(style.paddingLeft || '0') > 4 ||
      Number.parseFloat(style.paddingRight || '0') > 4;
    const isInlineTextLink = isLinkLike && !hasVisualChrome && height < 32;
    const shouldCheckTargetSize = window.innerWidth < 768 ? !isInlineTextLink : !isLinkLike;

    if (shouldCheckTargetSize && shortfall > 0) {
      pushIssue(
        createIssue({
          ruleId: 'target-size',
          severity: shortfall >= 12 ? 'high' : 'medium',
          title: 'Interactive target is too small',
          summary: `Target measures ${Math.round(width)}x${Math.round(height)}px.`,
          details: `Interactive targets should generally be at least ${settings.minTargetSize}px in both dimensions.`,
          selector: getSelectorHint(element),
          tags: ['wcag', 'touch', 'mobile'],
          wcagCriteria: ['2.5.8'],
          evidence: { width: Math.round(width), height: Math.round(height) },
        }),
      );
    }
  }

  const genericLabels = new Map();
  const genericPattern = /^(learn more|read more|more|click here|get started|details)$/i;

  for (const element of interactiveElements) {
    const label = getVisibleText(element);
    if (!genericPattern.test(label)) continue;

    const entries = genericLabels.get(label.toLowerCase()) ?? [];
    entries.push({
      element,
      label,
      href: element.getAttribute('href') || null,
    });
    genericLabels.set(label.toLowerCase(), entries);
  }

  for (const [label, entries] of genericLabels.entries()) {
    if (entries.length <= settings.maxGenericLabelOccurrences) continue;

    const uniqueTargets = new Set(entries.map((entry) => entry.href || getSelectorHint(entry.element)));
    if (uniqueTargets.size <= 1) continue;

    pushIssue(
      createIssue({
        ruleId: 'generic-cta-label',
        severity: 'medium',
        title: 'Repeated generic action labels',
        summary: `"${label}" appears ${entries.length} times with different targets.`,
        details: 'Repeated generic labels reduce scan speed and make it harder to distinguish actions in dense content.',
        selector: entries.map((entry) => getSelectorHint(entry.element)).slice(0, 5).join(', '),
        tags: ['content', 'cta'],
        wcagCriteria: ['2.4.4'],
        evidence: { count: entries.length },
      }),
    );
  }

  const report = {
    auditId: 'interaction',
    label: 'Interaction quality',
    url: window.location.href,
    title: document.title,
    issueCount: issues.length,
    issues,
    stats: {
      interactiveCount: interactiveElements.length,
    },
  };

  if (!settings.quiet) {
    console.groupCollapsed(`[Design Audit][Interaction] ${report.issueCount} issue(s)`);
    if (report.issueCount > 0) console.table(report.issues);
    console.groupEnd();
  }

  return report;
}

window.runInteractionAudit = runInteractionAudit;
