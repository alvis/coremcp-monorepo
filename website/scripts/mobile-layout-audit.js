/**
 * Mobile layout and readability audit for rendered pages.
 */

function runMobileLayoutAudit(options = {}) {
  const settings = {
    maxIssues: 200,
    ignoreSelectors: [],
    minBodyFontSize: 15.5,
    maxOverlayViewportHeightRatio: 0.3,
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
    category: 'mobile',
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

  const viewportMeta = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
  if (!viewportMeta) {
    pushIssue(
      createIssue({
        ruleId: 'viewport-meta',
        severity: 'high',
        title: 'Missing viewport meta tag',
        summary: 'The page is missing a viewport meta tag.',
        details: 'Without a viewport declaration, mobile layout and text scaling become unreliable.',
        selector: 'meta[name="viewport"]',
        tags: ['mobile', 'viewport'],
        wcagCriteria: ['1.4.4'],
      }),
    );
  } else {
    const lowerViewportMeta = viewportMeta.toLowerCase();
    if (lowerViewportMeta.includes('user-scalable=no') || /maximum-scale\s*=\s*1/.test(lowerViewportMeta)) {
      pushIssue(
        createIssue({
          ruleId: 'viewport-zoom',
          severity: 'high',
          title: 'Viewport restricts zooming',
          summary: 'The viewport meta tag restricts zooming.',
          details: 'Preventing zoom blocks users who need browser scaling instead of in-page resizing.',
          selector: 'meta[name="viewport"]',
          tags: ['mobile', 'wcag'],
          wcagCriteria: ['1.4.4'],
          evidence: { content: viewportMeta },
        }),
      );
    }
  }

  const horizontalOverflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  if (horizontalOverflow > 2) {
    pushIssue(
      createIssue({
        ruleId: 'horizontal-overflow',
        severity: horizontalOverflow > 24 ? 'high' : 'medium',
        title: 'Horizontal overflow on mobile viewport',
        summary: `The page overflows horizontally by ${Math.round(horizontalOverflow)}px.`,
        details: 'Horizontal scrolling is a strong sign that some content, code samples, or controls do not fit the viewport.',
        selector: 'html',
        tags: ['mobile', 'layout'],
        evidence: { overflow: Math.round(horizontalOverflow), viewportWidth: window.innerWidth },
      }),
    );
  }

  const textCandidates = Array.from(document.querySelectorAll('p, li, dd, dt, blockquote')).filter((element) => {
    if (matchesIgnoredSelector(element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const text = (element.innerText || element.textContent || '').trim();

    return (
      text.length >= 20 &&
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none'
    );
  });

  for (const element of textCandidates) {
    const fontSize = Number.parseFloat(getComputedStyle(element).fontSize || '16');
    if (fontSize >= settings.minBodyFontSize) continue;

    pushIssue(
      createIssue({
        ruleId: 'mobile-body-text-size',
        severity: fontSize <= 14 ? 'high' : 'medium',
        title: 'Body text is too small on mobile',
        summary: `Body text renders at ${fontSize}px.`,
        details: `Long-form content should generally render at ${settings.minBodyFontSize}px or above on mobile to avoid zoom dependency.`,
        selector: getSelectorHint(element),
        tags: ['mobile', 'readability'],
        wcagCriteria: ['1.4.4'],
        evidence: { fontSize },
      }),
    );
  }

  const overlayCandidates = Array.from(document.querySelectorAll('body *')).filter((element) => {
    if (matchesIgnoredSelector(element)) return false;
    const style = getComputedStyle(element);
    if (!['fixed', 'sticky'].includes(style.position)) return false;

    const rect = element.getBoundingClientRect();
    return rect.width >= window.innerWidth * 0.7 && rect.height >= window.innerHeight * settings.maxOverlayViewportHeightRatio;
  });

  for (const element of overlayCandidates.slice(0, 10)) {
    const rect = element.getBoundingClientRect();
    pushIssue(
      createIssue({
        ruleId: 'overlay-dominance',
        severity: rect.height >= window.innerHeight * 0.45 ? 'high' : 'medium',
        title: 'Large fixed overlay on mobile viewport',
        summary: `A fixed element occupies ${Math.round((rect.height / window.innerHeight) * 100)}% of the viewport height.`,
        details: 'Large sticky or fixed layers can crowd content, especially when combined with narrow reading columns and mobile keyboards.',
        selector: getSelectorHint(element),
        tags: ['mobile', 'overlay'],
        evidence: {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      }),
    );
  }

  const report = {
    auditId: 'mobile',
    label: 'Mobile layout',
    url: window.location.href,
    title: document.title,
    issueCount: issues.length,
    issues,
    stats: {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      textCandidateCount: textCandidates.length,
    },
  };

  if (!settings.quiet) {
    console.groupCollapsed(`[Design Audit][Mobile] ${report.issueCount} issue(s)`);
    if (report.issueCount > 0) console.table(report.issues);
    console.groupEnd();
  }

  return report;
}

window.runMobileLayoutAudit = runMobileLayoutAudit;
