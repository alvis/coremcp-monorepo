/**
 * Semantic structure and baseline accessibility audit for rendered pages.
 *
 * Run this in the browser console or inject it before `runDesignAudit()`.
 */

function runSemanticStructureAudit(options = {}) {
  const settings = {
    maxIssues: 200,
    ignoreSelectors: [],
    minTitleLength: 18,
    minMetaDescriptionLength: 70,
    maxMetaDescriptionLength: 170,
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

  const getLabelledByText = (element) =>
    (element.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((node) => (node.innerText || node.textContent || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();

  const getAccessibleName = (element) => {
    if (!element) return '';

    const ariaLabel = (element.getAttribute('aria-label') || '').trim();
    if (ariaLabel) return ariaLabel;

    const labelledBy = getLabelledByText(element);
    if (labelledBy) return labelledBy;

    const alt = (element.getAttribute('alt') || '').trim();
    if (alt) return alt;

    const title = (element.getAttribute('title') || '').trim();
    if (title) return title;

    if (element.id) {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      const labelText = (label?.innerText || label?.textContent || '').trim();
      if (labelText) return labelText;
    }

    const wrappedLabelText = (element.closest('label')?.innerText || '').trim();
    if (wrappedLabelText) return wrappedLabelText;

    const value = typeof element.value === 'string' ? element.value.trim() : '';
    if (value) return value;

    const placeholder = (element.getAttribute('placeholder') || '').trim();
    if (placeholder) return placeholder;

    return (element.innerText || element.textContent || '').trim();
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
    category: 'structure',
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

  const pageTitle = document.title.trim();
  if (!pageTitle) {
    pushIssue(
      createIssue({
        ruleId: 'document-title',
        severity: 'high',
        title: 'Missing document title',
        summary: 'The page has no document title.',
        details: 'A missing title weakens orientation, browser history labels, and search previews.',
        selector: 'head > title',
        tags: ['wcag', 'seo', 'orientation'],
        wcagCriteria: ['2.4.2'],
      }),
    );
  } else if (pageTitle.length < settings.minTitleLength) {
    pushIssue(
      createIssue({
        ruleId: 'document-title-specificity',
        severity: 'low',
        title: 'Document title is underspecified',
        summary: `The title is only ${pageTitle.length} characters long.`,
        details: 'Short titles often miss page-specific context, especially on documentation pages.',
        selector: 'head > title',
        tags: ['seo', 'orientation'],
        evidence: { title: pageTitle },
      }),
    );
  }

  const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
  if (!metaDescription) {
    pushIssue(
      createIssue({
        ruleId: 'meta-description',
        severity: 'low',
        title: 'Missing meta description',
        summary: 'The page is missing a meta description.',
        details: 'This weakens search result previews and makes content intent harder to scan outside the page.',
        selector: 'meta[name="description"]',
        tags: ['seo', 'content'],
      }),
    );
  } else if (
    metaDescription.length < settings.minMetaDescriptionLength ||
    metaDescription.length > settings.maxMetaDescriptionLength
  ) {
    pushIssue(
      createIssue({
        ruleId: 'meta-description-length',
        severity: 'low',
        title: 'Meta description length is off target',
        summary: `The meta description is ${metaDescription.length} characters long.`,
        details: 'The current description is likely too short or too long to communicate value cleanly in search results.',
        selector: 'meta[name="description"]',
        tags: ['seo', 'content'],
        evidence: { length: metaDescription.length },
      }),
    );
  }

  const mains = Array.from(document.querySelectorAll('main, [role="main"]')).filter(
    (element) => !matchesIgnoredSelector(element),
  );
  if (mains.length === 0) {
    pushIssue(
      createIssue({
        ruleId: 'landmark-main',
        severity: 'high',
        title: 'Missing main landmark',
        summary: 'No main landmark was found on the page.',
        details: 'Screen-reader users and keyboard users rely on a single main region to jump into the primary content.',
        selector: 'main',
        tags: ['wcag', 'structure'],
        wcagCriteria: ['1.3.1', '2.4.1'],
      }),
    );
  } else if (mains.length > 1) {
    pushIssue(
      createIssue({
        ruleId: 'landmark-main-unique',
        severity: 'medium',
        title: 'Multiple main landmarks',
        summary: `Found ${mains.length} main landmarks.`,
        details: 'Pages should expose one clear main content region to avoid orientation ambiguity.',
        selector: mains.map(getSelectorHint).join(', '),
        tags: ['wcag', 'structure'],
        wcagCriteria: ['1.3.1'],
      }),
    );
  }

  const skipLink = Array.from(document.querySelectorAll('a[href^="#"]')).find((anchor) => {
    const text = (anchor.innerText || anchor.textContent || '').trim().toLowerCase();
    return text.includes('skip') && !matchesIgnoredSelector(anchor);
  });
  if (!skipLink) {
    pushIssue(
      createIssue({
        ruleId: 'skip-link',
        severity: 'medium',
        title: 'Missing skip link',
        summary: 'No visible skip link was detected.',
        details: 'A skip link is important on documentation pages with persistent navigation and search chrome.',
        selector: 'a[href^="#"]',
        tags: ['wcag', 'navigation'],
        wcagCriteria: ['2.4.1'],
      }),
    );
  }

  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(
    (element) => !matchesIgnoredSelector(element),
  );
  const h1s = headings.filter((element) => element.tagName === 'H1');

  if (h1s.length === 0) {
    pushIssue(
      createIssue({
        ruleId: 'heading-h1',
        severity: 'high',
        title: 'Missing H1 heading',
        summary: 'The page has no H1 heading.',
        details: 'Primary pages should have one clear page-level heading that matches the user’s mental model of where they are.',
        selector: 'h1',
        tags: ['wcag', 'hierarchy'],
        wcagCriteria: ['1.3.1', '2.4.6'],
      }),
    );
  } else if (h1s.length > 1) {
    pushIssue(
      createIssue({
        ruleId: 'heading-h1-unique',
        severity: 'medium',
        title: 'Multiple H1 headings',
        summary: `Found ${h1s.length} H1 headings.`,
        details: 'Multiple H1s often flatten the page hierarchy and reduce scannability.',
        selector: h1s.map(getSelectorHint).join(', '),
        tags: ['wcag', 'hierarchy'],
        wcagCriteria: ['1.3.1', '2.4.6'],
      }),
    );
  }

  let previousHeadingLevel = 0;
  for (const heading of headings) {
    const level = Number.parseInt(heading.tagName.slice(1), 10);
    if (previousHeadingLevel > 0 && level - previousHeadingLevel > 1) {
      pushIssue(
        createIssue({
          ruleId: 'heading-order',
          severity: 'medium',
          title: 'Heading level jump',
          summary: `Heading order jumps from H${previousHeadingLevel} to H${level}.`,
          details: 'Skipped heading levels make the structure harder to scan visually and with assistive technology.',
          selector: getSelectorHint(heading),
          tags: ['wcag', 'hierarchy'],
          wcagCriteria: ['1.3.1', '2.4.6'],
          evidence: { heading: (heading.innerText || '').trim().slice(0, 120) },
        }),
      );
    }

    previousHeadingLevel = level;
  }

  const duplicateIdCounts = {};
  for (const element of Array.from(document.querySelectorAll('[id]'))) {
    if (matchesIgnoredSelector(element)) continue;
    duplicateIdCounts[element.id] = (duplicateIdCounts[element.id] || 0) + 1;
  }

  for (const [id, count] of Object.entries(duplicateIdCounts)) {
    if (count <= 1) continue;
    pushIssue(
      createIssue({
        ruleId: 'duplicate-id',
        severity: 'medium',
        title: 'Duplicate id attribute',
        summary: `The id "${id}" appears ${count} times.`,
        details: 'Duplicate IDs break label relationships, fragment navigation, and scripted focus management.',
        selector: `#${id}`,
        tags: ['wcag', 'dom-integrity'],
        wcagCriteria: ['4.1.1', '4.1.2'],
      }),
    );
  }

  const images = Array.from(document.querySelectorAll('img')).filter((element) => !matchesIgnoredSelector(element));
  for (const image of images) {
    const role = image.getAttribute('role');
    const hidden = image.getAttribute('aria-hidden') === 'true';
    const alt = image.getAttribute('alt');
    if (hidden || role === 'presentation') continue;

    if (alt == null || alt.trim() === '') {
      pushIssue(
        createIssue({
          ruleId: 'image-alt',
          severity: 'high',
          title: 'Image without useful alt text',
          summary: 'An image is missing alt text.',
          details: 'Content and UI images need text alternatives unless they are explicitly decorative.',
          selector: getSelectorHint(image),
          tags: ['wcag', 'media'],
          wcagCriteria: ['1.1.1'],
        }),
      );
    }
  }

  const interactiveSelector = [
    'a[href]',
    'button',
    'summary',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
  ].join(', ');

  for (const element of Array.from(document.querySelectorAll(interactiveSelector))) {
    if (matchesIgnoredSelector(element)) continue;
    if (element.closest('[aria-hidden="true"]')) continue;

    const name = getAccessibleName(element);
    if (!name) {
      pushIssue(
        createIssue({
          ruleId: 'control-accessible-name',
          severity: 'high',
          title: 'Interactive control without accessible name',
          summary: 'An interactive element has no accessible name.',
          details: 'Buttons, links, form fields, and disclosure controls need a programmatic label that matches what users see.',
          selector: getSelectorHint(element),
          tags: ['wcag', 'forms', 'controls'],
          wcagCriteria: ['4.1.2', '2.5.3'],
        }),
      );
    }
  }

  const formControls = Array.from(
    document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'),
  ).filter((element) => !matchesIgnoredSelector(element));

  for (const element of formControls) {
    const label = getAccessibleName(element);
    if (!label) {
      pushIssue(
        createIssue({
          ruleId: 'form-label',
          severity: 'high',
          title: 'Form control without label',
          summary: 'A form control is missing a visible or programmatic label.',
          details: 'Placeholder-only labeling breaks accessibility and generally performs poorly for comprehension.',
          selector: getSelectorHint(element),
          tags: ['wcag', 'forms'],
          wcagCriteria: ['3.3.2', '4.1.2'],
        }),
      );
    }
  }

  const report = {
    auditId: 'structure',
    label: 'Semantic structure',
    url: window.location.href,
    title: document.title,
    issueCount: issues.length,
    issues,
    stats: {
      headingCount: headings.length,
      h1Count: h1s.length,
      mainCount: mains.length,
      imageCount: images.length,
      interactiveCount: document.querySelectorAll(interactiveSelector).length,
    },
  };

  if (!settings.quiet) {
    console.groupCollapsed(`[Design Audit][Structure] ${report.issueCount} issue(s)`);
    if (report.issueCount > 0) console.table(report.issues);
    console.groupEnd();
  }

  return report;
}

window.runSemanticStructureAudit = runSemanticStructureAudit;
