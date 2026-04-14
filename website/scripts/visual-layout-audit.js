function runVisualLayoutAudit(options = {}) {
  const settings = {
    quiet: false,
    desktopMinWidth: 1100,
    mobileMaxWidth: 520,
    heroHeightRatio: 1.4,
    heroBottomOverflow: 48,
    tocDetachedGap: 28,
    tocMinWidth: 220,
    mobileFragmentationCount: 10,
    mobileScrollLengthRatio: 6,
    mobileCardMinHeight: 72,
    mobileCardMaxHeight: 420,
    mobileCardMinRadius: 12,
    ...options,
  };

  const issues = [];
  const manualReview = [];

  const getRect = (node) => {
    if (!node) return null;
    const rect = node.getBoundingClientRect();

    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
  };

  const selectorHint = (element) => {
    if (!element) return null;
    if (element.id) return `#${element.id}`;
    const classNames = Array.from(element.classList || []).slice(0, 3);
    return classNames.length > 0
      ? `${element.tagName.toLowerCase()}.${classNames.join('.')}`
      : element.tagName.toLowerCase();
  };

  const createManualReviewEntry = ({
    selector,
    summary,
    reason,
    aiPrompt,
    humanArea,
    humanChecks,
  }) => ({
    selector,
    summary,
    reason,
    aiGrounding: {
      selector,
      cropPadding: 20,
      prompt: aiPrompt,
    },
    humanReview: {
      area: humanArea,
      checklist: humanChecks,
    },
  });

  const analyzeHeroBalance = () => {
    if (window.innerWidth < settings.desktopMinWidth) return;

    const main = document.querySelector('main');
    const heroSection = main?.querySelector('section');
    const heading = heroSection?.querySelector('h1');
    const visual =
      heroSection?.querySelector('[class*="heroArtwork"], [class*="heroImageWrap"], [class*="docsHeroMedia"], img');

    if (!heroSection || !heading || !visual) return;

    const copy = heading.closest('[class*="heroCopy"], [class*="heroInner"], [class*="docsHeroInner"]') || heading.parentElement;
    const heroRect = getRect(heroSection);
    const copyRect = getRect(copy);
    const visualRect = getRect(visual);
    if (!heroRect || !copyRect || !visualRect) return;

    const heightRatio = visualRect.height / Math.max(copyRect.height, 1);
    const overflow = heroRect.bottom - window.innerHeight;

    if (heightRatio >= settings.heroHeightRatio && overflow >= settings.heroBottomOverflow) {
      issues.push({
        category: 'visual',
        ruleId: 'hero-visual-balance',
        severity: 'medium',
        title: 'Hero artwork dominates the first screen',
        summary:
          `Hero media is ${heightRatio.toFixed(2)}x taller than the copy block and pushes the first section ${Math.round(overflow)}px below the fold.`,
        details:
          'The opening composition feels visually underweighted on the text side, which makes the page read sparse instead of deliberate.',
        selector: selectorHint(heroSection),
        tags: ['layout', 'hierarchy', 'hero'],
        evidence: {
          heroHeight: Math.round(heroRect.height),
          copyHeight: Math.round(copyRect.height),
          visualHeight: Math.round(visualRect.height),
          visualToCopyHeightRatio: Number(heightRatio.toFixed(2)),
          belowFoldOverflow: Math.round(overflow),
        },
      });
    } else if (heightRatio >= settings.heroHeightRatio - 0.12) {
      manualReview.push(
        createManualReviewEntry({
          selector: selectorHint(heroSection),
          summary: 'Hero composition may be visually imbalanced.',
          reason: `Artwork-to-copy height ratio is ${heightRatio.toFixed(2)} with ${Math.max(0, Math.round(overflow))}px below the fold.`,
          aiPrompt:
            'Review this hero crop for composition balance. Look for undersized copy, oversized artwork, dead space, and whether the first screen feels sparse or awkward.',
          humanArea: 'Opening hero composition',
          humanChecks: [
            'Does the copy block carry enough visual weight relative to the artwork?',
            'Does the first screen feel intentional rather than sparse?',
            'Is important content visible without requiring a scroll?',
          ],
        }),
      );
    }
  };

  const analyzeDesktopToc = () => {
    if (window.innerWidth < settings.desktopMinWidth) return;

    const tocWrap = document.querySelector('.theme-doc-toc-desktop');
    const toc = document.querySelector('.table-of-contents');
    const article = document.querySelector('article');

    if (!tocWrap || !toc || !article) return;

    const tocRect = getRect(tocWrap);
    const articleRect = getRect(article);
    const tocStyle = getComputedStyle(tocWrap);
    if (!tocRect || !articleRect || tocStyle.display === 'none' || tocRect.width < 1) return;

    const gap = tocRect.left - articleRect.right;

    if (gap > settings.tocDetachedGap || tocRect.width < settings.tocMinWidth) {
      issues.push({
        category: 'visual',
        ruleId: 'detached-desktop-toc',
        severity: gap > settings.tocDetachedGap + 16 ? 'medium' : 'low',
        title: 'Desktop table of contents feels detached from the article',
        summary:
          `Desktop TOC sits ${Math.round(gap)}px away from the article and is ${Math.round(tocRect.width)}px wide.`,
        details:
          'The right-rail navigation reads like a disconnected gutter element instead of an intentional reading aid.',
        selector: '.theme-doc-toc-desktop',
        tags: ['layout', 'navigation', 'docs'],
        evidence: {
          tocWidth: Math.round(tocRect.width),
          articleWidth: Math.round(articleRect.width),
          tocGap: Math.round(gap),
        },
      });
    } else {
      manualReview.push(
        createManualReviewEntry({
          selector: '.theme-doc-toc-desktop',
          summary: 'Desktop TOC placement should be visually grounded.',
          reason: `TOC width is ${Math.round(tocRect.width)}px with a ${Math.round(gap)}px article gap.`,
          aiPrompt:
            'Review this TOC crop for visual grounding. Check whether it feels attached to the reading surface, properly sized, and easy to scan.',
          humanArea: 'Desktop right-rail TOC',
          humanChecks: [
            'Does the TOC feel visually connected to the article?',
            'Is the TOC wide enough to scan without awkward wrapping?',
            'Does the right rail look intentional rather than leftover whitespace?',
          ],
        }),
      );
    }
  };

  const analyzeMobileFragmentation = () => {
    if (window.innerWidth > settings.mobileMaxWidth) return;

    const main = document.querySelector('main');
    if (!main) return;

    const candidateElements = Array.from(main.querySelectorAll('article, a, div, section')).filter((element) => {
      const style = getComputedStyle(element);
      const rect = getRect(element);
      const borderRadius = Number.parseFloat(style.borderRadius || '0') || 0;
      const hasVisibleBorder = ['Top', 'Right', 'Bottom', 'Left'].some(
        (edge) => Number.parseFloat(style[`border${edge}Width`] || '0') > 0.5,
      );
      const textLength = (element.textContent || '').trim().length;

      return (
        rect &&
        rect.width >= window.innerWidth * 0.7 &&
        rect.height >= settings.mobileCardMinHeight &&
        rect.height <= settings.mobileCardMaxHeight &&
        borderRadius >= settings.mobileCardMinRadius &&
        textLength >= 18 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        (style.boxShadow !== 'none' || hasVisibleBorder)
      );
    });

    const pageHeightRatio = document.documentElement.scrollHeight / Math.max(window.innerHeight, 1);

    if (
      candidateElements.length >= settings.mobileFragmentationCount &&
      pageHeightRatio >= settings.mobileScrollLengthRatio
    ) {
      issues.push({
        category: 'visual',
        ruleId: 'mobile-boxed-fragmentation',
        severity: 'medium',
        title: 'Mobile page is over-segmented into boxed panels',
        summary:
          `The page stacks ${candidateElements.length} wide boxed panels across ${pageHeightRatio.toFixed(1)} viewport heights.`,
        details:
          'The layout reads as a long sequence of repeated cards instead of a paced narrative, which makes mobile scanning feel dense and repetitive.',
        selector: selectorHint(candidateElements[0]),
        tags: ['layout', 'mobile', 'density'],
        evidence: {
          boxedPanelCount: candidateElements.length,
          pageHeightRatio: Number(pageHeightRatio.toFixed(1)),
        },
      });
    } else if (candidateElements.length >= settings.mobileFragmentationCount - 2) {
      manualReview.push(
        createManualReviewEntry({
          selector: selectorHint(candidateElements[0]),
          summary: 'Mobile page may feel overly boxed and repetitive.',
          reason: `Detected ${candidateElements.length} boxed panels across ${pageHeightRatio.toFixed(1)} viewport heights.`,
          aiPrompt:
            'Review this mobile crop for layout rhythm. Check whether repeated boxed panels make the page feel dense, repetitive, or exhausting to scan.',
          humanArea: 'Mobile content rhythm',
          humanChecks: [
            'Does the page feel like too many repeated cards in sequence?',
            'Would some sections read better as lighter rows or grouped lists?',
            'Is scrolling paced, or does the page feel long and low-signal?',
          ],
        }),
      );
    }
  };

  analyzeHeroBalance();
  analyzeDesktopToc();
  analyzeMobileFragmentation();

  const report = {
    auditId: 'visual',
    label: 'Visual composition',
    issueCount: issues.length,
    issues,
    manualReview,
    stats: {
      manualReviewCount: manualReview.length,
    },
  };

  if (!settings.quiet) {
    console.groupCollapsed(`[Visual Audit] ${issues.length} issue(s), ${manualReview.length} manual review item(s)`);
    if (issues.length > 0) console.table(issues);
    if (manualReview.length > 0) console.table(manualReview);
    console.groupEnd();
  }

  return report;
}

window.runVisualLayoutAudit = runVisualLayoutAudit;
