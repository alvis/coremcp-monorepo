/**
 * WCAG text contrast audit for rendered pages.
 *
 * Run this in the browser console or inject it with DevTools/Chrome MCP.
 * It audits rendered leaf text elements instead of only hand-picked classes.
 *
 * Example:
 *   const report = runWcagTextAudit();
 *   console.table(report.failures);
 *   report;
 */

function runWcagTextAudit(options = {}) {
  const settings = {
    quiet: false,
    includePassing: false,
    minTextLength: 2,
    maxFailures: 250,
    maxManualReview: 250,
    maxIssues: 500,
    sampleXRatio: 0.35,
    sampleYRatio: 0.5,
    selectorBackgrounds: [],
    ignoreSelectors: [],
    failOnComplexSurfaces: true,
    manualReviewContrastBuffer: 0.75,
    minReliableSurfaceAlpha: 0.6,
    minCollapsedLineCount: 4,
    minAverageWordsPerLine: 2.6,
    minAverageCharsPerLine: 14,
    minExpandableWidthGain: 120,
    minExpandableWidthRatio: 1.45,
    maxComfortableLineLength: 72,
    minFrameClearance: 12,
    maxContainerDepth: 7,
    minNarrowHeadingLineCount: 4,
    maxNarrowHeadingCharsPerLine: 18,
    minNarrowHeadingWidthGain: 160,
    minNarrowHeadingWidthRatio: 1.7,
    minControlHeight: 44,
    minDesktopSearchWidth: 240,
    maxNavbarControlHeightDelta: 6,
    minPillAspectRatio: 1.55,
    maxShortControlChars: 12,
    minSingleLineLabelClearance: 10,
    ...options,
  };

  const parseColor = (value) => {
    if (!value || value === 'transparent') return null;

    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;

    const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
    const [r, g, b, a = 1] = parts;

    return {
      r,
      g,
      b,
      a: Number.isNaN(a) ? 1 : a,
    };
  };

  const composite = (foreground, background) => {
    const alpha = foreground.a + background.a * (1 - foreground.a);

    return {
      r: ((foreground.r * foreground.a) + (background.r * background.a * (1 - foreground.a))) / alpha,
      g: ((foreground.g * foreground.a) + (background.g * background.a * (1 - foreground.a))) / alpha,
      b: ((foreground.b * foreground.a) + (background.b * background.a * (1 - foreground.a))) / alpha,
      a: alpha,
    };
  };

  const toRgbString = ({ r, g, b }) =>
    `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

  const toHex = ({ r, g, b }) =>
    `#${[r, g, b]
      .map((value) => Math.round(value).toString(16).padStart(2, '0'))
      .join('')}`;

  const toFixedNumber = (value, digits = 2) => Number(value.toFixed(digits));

  const luminance = ({ r, g, b }) => {
    const values = [r, g, b].map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
  };

  const getContrastRatio = (foreground, background) => {
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  };

  const getBodyBackground = () => {
    const bodyColor = parseColor(getComputedStyle(document.body).backgroundColor);

    return bodyColor ?? {
      r: 255,
      g: 255,
      b: 255,
      a: 1,
    };
  };

  const normalizeOverride = (override) => {
    if (typeof override === 'string') {
      return {
        selector: override,
        backgroundColor: null,
        backgroundSelector: override,
        label: override,
      };
    }

    return {
      selector: override.selector,
      backgroundColor: override.backgroundColor ?? null,
      backgroundSelector: override.backgroundSelector ?? override.selector,
      label: override.label ?? override.selector,
    };
  };

  const selectorBackgrounds = settings.selectorBackgrounds.map(normalizeOverride);

  const ignoredSelectors = settings.ignoreSelectors.filter(Boolean);

  const matchesIgnoredSelector = (element) =>
    ignoredSelectors.some((selector) => element.closest(selector));

  const isVisibleLeafTextElement = (element) => {
    const text = (element.innerText || element.textContent || '').trim().replace(/\s+/g, ' ');
    if (text.length < settings.minTextLength) return false;

    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (Number.parseFloat(style.opacity || '1') === 0) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 8) return false;

    for (const child of element.children) {
      const childText = (child.innerText || child.textContent || '').trim();
      if (childText) return false;
    }

    return true;
  };

  const getSamplePoint = (rect) => {
    const x = Math.max(
      1,
      Math.min(
        window.innerWidth - 1,
        rect.left + Math.min(Math.max(rect.width * settings.sampleXRatio, 4), rect.width - 1),
      ),
    );
    const y = Math.max(
      1,
      Math.min(
        window.innerHeight - 1,
        rect.top + Math.min(Math.max(rect.height * settings.sampleYRatio, 4), rect.height - 1),
      ),
    );

    return { x, y };
  };

  const getEffectiveBackground = (target, samplePoint) => {
    const stack = document.elementsFromPoint(samplePoint.x, samplePoint.y);
    let background = getBodyBackground();

    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const element = stack[index];
      const color = parseColor(getComputedStyle(element).backgroundColor);

      if (color && color.a > 0) {
        background = composite(color, background);
      }

      if (element === target) break;
    }

    return background;
  };

  const getReliableSurfaceBackground = (element) => {
    let current = element;
    let depth = 0;
    let background = getBodyBackground();

    while (current && current !== document.documentElement && depth < 12) {
      const style = getComputedStyle(current);
      const color = parseColor(style.backgroundColor);
      const hasStrongEffects =
        (style.backdropFilter && style.backdropFilter !== 'none') ||
        (style.filter && style.filter !== 'none') ||
        (style.mixBlendMode && style.mixBlendMode !== 'normal');

      if (color && color.a >= settings.minReliableSurfaceAlpha && !hasStrongEffects) {
        return {
          color: composite(color, background),
          source: 'solid-surface-fallback',
          selector: getSelectorHint(current),
        };
      }

      if (color && color.a > 0) {
        background = composite(color, background);
      }

      current = current.parentElement;
      depth += 1;
    }

    return null;
  };

  const getComplexSurfaceFlags = (element) => {
    const flags = [];
    let current = element;
    let depth = 0;

    while (current && current !== document.documentElement && depth < 12) {
      const style = getComputedStyle(current);
      const backgroundColor = parseColor(style.backgroundColor);
      const beforeStyle = getComputedStyle(current, '::before');
      const afterStyle = getComputedStyle(current, '::after');
      const isRootSurface = current === document.body || current === document.documentElement;
      const hasOpaqueSolidSurface =
        backgroundColor &&
        backgroundColor.a >= 0.98 &&
        (!style.backgroundImage || style.backgroundImage === 'none') &&
        (!style.backdropFilter || style.backdropFilter === 'none') &&
        (!style.filter || style.filter === 'none');

      if (!isRootSurface && style.backgroundImage && style.backgroundImage !== 'none') {
        flags.push(`background-image on ${current.tagName.toLowerCase()}`);
      }

      if (!isRootSurface && style.backdropFilter && style.backdropFilter !== 'none') {
        flags.push(`backdrop-filter on ${current.tagName.toLowerCase()}`);
      }

      if (!isRootSurface && style.filter && style.filter !== 'none') {
        flags.push(`filter on ${current.tagName.toLowerCase()}`);
      }

      if (!isRootSurface && style.mixBlendMode && style.mixBlendMode !== 'normal') {
        flags.push(`mix-blend-mode on ${current.tagName.toLowerCase()}`);
      }

      if (!isRootSurface && backgroundColor && backgroundColor.a > 0 && backgroundColor.a < 1) {
        flags.push(`transparent background on ${current.tagName.toLowerCase()}`);
      }

      for (const [pseudoName, pseudoStyle] of [
        ['::before', beforeStyle],
        ['::after', afterStyle],
      ]) {
        const pseudoBackground = parseColor(pseudoStyle.backgroundColor);

        if (!isRootSurface && pseudoStyle.backgroundImage && pseudoStyle.backgroundImage !== 'none') {
          flags.push(`${pseudoName} background-image on ${current.tagName.toLowerCase()}`);
        }

        if (!isRootSurface && pseudoBackground && pseudoBackground.a > 0) {
          flags.push(`${pseudoName} background on ${current.tagName.toLowerCase()}`);
        }

        if (!isRootSurface && pseudoStyle.filter && pseudoStyle.filter !== 'none') {
          flags.push(`${pseudoName} filter on ${current.tagName.toLowerCase()}`);
        }
      }

      if (hasOpaqueSolidSurface) {
        break;
      }

      current = current.parentElement;
      depth += 1;
    }

    return [...new Set(flags)];
  };

  const getOverrideBackground = (element) => {
    const override = selectorBackgrounds.find((entry) => element.matches(entry.selector) || element.closest(entry.selector));
    if (!override) return null;

    if (override.backgroundColor) {
      const parsed = parseColor(override.backgroundColor);
      if (parsed) {
        return {
          source: 'override-color',
          label: override.label,
          color: parsed,
        };
      }
    }

    const backgroundElement = element.closest(override.backgroundSelector);
    if (!backgroundElement) return null;

    const style = getComputedStyle(backgroundElement);
    const parsed = parseColor(style.backgroundColor);
    if (!parsed) return null;

    return {
      source: 'override-selector',
      label: override.label,
      color: parsed,
    };
  };

  const getThreshold = (style) => {
    const size = Number.parseFloat(style.fontSize || '16');
    const weight = Number.parseInt(style.fontWeight || '400', 10);
    const isLarge = size >= 24 || (size >= 18.66 && weight >= 700);

    return {
      size,
      weight,
      largeText: isLarge,
      minimum: isLarge ? 3 : 4.5,
    };
  };

  const getSelectorHint = (element) => {
    if (element.id) return `#${element.id}`;

    const classNames = Array.from(element.classList).slice(0, 3);
    if (classNames.length > 0) {
      return `${element.tagName.toLowerCase()}.${classNames.join('.')}`;
    }

    return element.tagName.toLowerCase();
  };

  const getPseudoText = (style) => {
    const raw = style.content;
    if (!raw || raw === 'none' || raw === 'normal') return null;
    const text = raw.replace(/^['"]|['"]$/g, '').replace(/\\"/g, '"').replace(/\\A/g, ' ').trim();
    return text || null;
  };

  const measureTextWidth = (text, style) => {
    const canvas = measureTextWidth.canvas || (measureTextWidth.canvas = document.createElement('canvas'));
    const context = canvas.getContext('2d');
    const fontStyle = style.fontStyle || 'normal';
    const fontVariant = style.fontVariant || 'normal';
    const fontWeight = style.fontWeight || '400';
    const fontSize = style.fontSize || '16px';
    const fontFamily = style.fontFamily || 'sans-serif';
    context.font = `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize} ${fontFamily}`;
    return context.measureText(text).width;
  };

  const getPseudoRect = (element, pseudoName, pseudoStyle) => {
    const contentRect = getContentBoxRect(element);
    const width = contentRect.width;
    const lineHeight = Number.parseFloat(pseudoStyle.lineHeight || pseudoStyle.fontSize || '16') || 16;
    const fontSize = Number.parseFloat(pseudoStyle.fontSize || '16') || 16;
    const text = getPseudoText(pseudoStyle);
    const measuredWidth = measureTextWidth(text, pseudoStyle);
    const lineCount = Math.max(1, width > 0 ? Math.ceil(measuredWidth / Math.max(width, 1)) : 1);
    const usedWidth = Math.min(width || measuredWidth, measuredWidth || width);
    const usedHeight = Math.max(lineHeight * lineCount, fontSize);
    const marginTop = Number.parseFloat(pseudoStyle.marginTop || '0') || 0;
    const marginBottom = Number.parseFloat(pseudoStyle.marginBottom || '0') || 0;

    const isAfter = pseudoName === '::after';
    const top = isAfter
      ? contentRect.bottom - usedHeight - marginBottom
      : contentRect.top + marginTop;

    return {
      left: contentRect.left,
      top,
      right: contentRect.left + usedWidth,
      bottom: top + usedHeight,
      width: usedWidth,
      height: usedHeight,
      lineCount,
    };
  };

  const collectLineRects = (element) => {
    const range = document.createRange();
    range.selectNodeContents(element);

    return Array.from(range.getClientRects())
      .map((rect) => ({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }))
      .filter((rect) => rect.width >= 2 && rect.height >= 4);
  };

  const getUnionRect = (rects, fallbackRect) => {
    if (rects.length === 0) {
      return {
        left: fallbackRect.left,
        top: fallbackRect.top,
        right: fallbackRect.right,
        bottom: fallbackRect.bottom,
        width: fallbackRect.width,
        height: fallbackRect.height,
      };
    }

    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  };

  const getWords = (text) => text.split(/\s+/).filter(Boolean);

  const getLineMetrics = (element, rect, text, style) => {
    const lineRects = collectLineRects(element);
    const bounds = getUnionRect(lineRects, rect);
    const words = getWords(text);
    const characters = text.replace(/\s+/g, '').length;
    const lineCount = lineRects.length || 1;
    const maxLineWidth = lineRects.length > 0 ? Math.max(...lineRects.map((item) => item.width)) : rect.width;
    const minLineWidth = lineRects.length > 0 ? Math.min(...lineRects.map((item) => item.width)) : rect.width;
    const averageLineWidth =
      lineRects.length > 0
        ? lineRects.reduce((sum, item) => sum + item.width, 0) / lineRects.length
        : rect.width;
    const fontSize = Number.parseFloat(style.fontSize || '16');

    return {
      lineRects,
      bounds,
      lineCount,
      words,
      wordCount: words.length,
      characters,
      averageWordsPerLine: words.length / lineCount,
      averageCharsPerLine: characters / lineCount,
      maxLineWidth,
      minLineWidth,
      averageLineWidth,
      widthPerCharacter: characters > 0 ? bounds.width / characters : bounds.width,
      maxEstimatedCharactersPerLine:
        fontSize > 0 ? bounds.width / Math.max(fontSize * 0.58, 1) : bounds.width / 9,
    };
  };

  const getContentBoxRect = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const borderLeft = Number.parseFloat(style.borderLeftWidth || '0') || 0;
    const borderRight = Number.parseFloat(style.borderRightWidth || '0') || 0;
    const borderTop = Number.parseFloat(style.borderTopWidth || '0') || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth || '0') || 0;
    const paddingLeft = Number.parseFloat(style.paddingLeft || '0') || 0;
    const paddingRight = Number.parseFloat(style.paddingRight || '0') || 0;
    const paddingTop = Number.parseFloat(style.paddingTop || '0') || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom || '0') || 0;

    return {
      left: rect.left + borderLeft + paddingLeft,
      right: rect.right - borderRight - paddingRight,
      top: rect.top + borderTop + paddingTop,
      bottom: rect.bottom - borderBottom - paddingBottom,
      width: Math.max(0, rect.width - borderLeft - borderRight - paddingLeft - paddingRight),
      height: Math.max(0, rect.height - borderTop - borderBottom - paddingTop - paddingBottom),
    };
  };

  const hasFramingSurface = (style) => {
    const background = parseColor(style.backgroundColor);
    const visibleBorders = ['Top', 'Right', 'Bottom', 'Left'].filter((edge) => {
        const borderWidth = Number.parseFloat(style[`border${edge}Width`] || '0');
        return borderWidth > 0 && style[`border${edge}Style`] !== 'none';
      });
    const hasVisibleBorder = visibleBorders.length >= 2;
    const hasBackground = background && background.a > 0.08;
    const hasRadius = Number.parseFloat(style.borderRadius || '0') > 0;

    return hasBackground || hasVisibleBorder || (hasRadius && visibleBorders.length >= 1);
  };

  const getExpandableContainer = (element) => {
    const elementRect = element.getBoundingClientRect();
    let current = element.parentElement;
    let depth = 0;

    while (current && current !== document.body && depth < settings.maxContainerDepth) {
      const style = getComputedStyle(current);
      const contentRect = getContentBoxRect(current);
      const widthGain = contentRect.width - elementRect.width;
      const widthRatio = contentRect.width / Math.max(elementRect.width, 1);
      const canExpand =
        contentRect.width > 0 &&
        widthGain >= settings.minExpandableWidthGain &&
        widthRatio >= settings.minExpandableWidthRatio &&
        !['inline', 'contents'].includes(style.display);

      if (canExpand) {
        return {
          element: current,
          selector: getSelectorHint(current),
          contentRect,
          widthGain,
          widthRatio,
          freeLeft: Math.max(0, elementRect.left - contentRect.left),
          freeRight: Math.max(0, contentRect.right - elementRect.right),
        };
      }

      current = current.parentElement;
      depth += 1;
    }

    return null;
  };

  const getFramingContainer = (element) => {
    const textRect = element.getBoundingClientRect();
    const elementStyle = getComputedStyle(element);

    if (['fixed', 'absolute', 'sticky'].includes(elementStyle.position)) {
      return element;
    }

    if (hasFramingSurface(elementStyle)) {
      return element;
    }

    let current = element.parentElement;
    let depth = 0;

    while (current && current !== document.body && depth < settings.maxContainerDepth) {
      const style = getComputedStyle(current);
      const rect = current.getBoundingClientRect();
      const containsText =
        rect.width > textRect.width + 4 &&
        rect.height > textRect.height + 4 &&
        rect.left <= textRect.left &&
        rect.right >= textRect.right &&
        rect.top <= textRect.top &&
        rect.bottom >= textRect.bottom;

      if (containsText && hasFramingSurface(style)) {
        return current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return null;
  };

  const getFrameClearance = (element, textBounds) => {
    const frame = getFramingContainer(element);
    if (!frame) return null;

    const frameRect = frame.getBoundingClientRect();
    const frameStyle = getComputedStyle(frame);
    const borderLeft = Number.parseFloat(frameStyle.borderLeftWidth || '0') || 0;
    const borderRight = Number.parseFloat(frameStyle.borderRightWidth || '0') || 0;
    const borderTop = Number.parseFloat(frameStyle.borderTopWidth || '0') || 0;
    const borderBottom = Number.parseFloat(frameStyle.borderBottomWidth || '0') || 0;

    const innerRect = {
      left: frameRect.left + borderLeft,
      right: frameRect.right - borderRight,
      top: frameRect.top + borderTop,
      bottom: frameRect.bottom - borderBottom,
    };

    return {
      frame,
      selector: getSelectorHint(frame),
      left: Math.max(0, textBounds.left - innerRect.left),
      right: Math.max(0, innerRect.right - textBounds.right),
      top: Math.max(0, textBounds.top - innerRect.top),
      bottom: Math.max(0, innerRect.bottom - textBounds.bottom),
    };
  };

  const getMeasureIssue = (lineMetrics, expandableContainer) => {
    if (!expandableContainer) return null;
    if (lineMetrics.lineCount < settings.minCollapsedLineCount) return null;

    const averageCharsPerLine = lineMetrics.averageCharsPerLine;
    const averageWordsPerLine = lineMetrics.averageWordsPerLine;
    const availableCharsPerLine = Math.min(
      settings.maxComfortableLineLength,
      lineMetrics.maxEstimatedCharactersPerLine * expandableContainer.widthRatio,
    );

    const looksCollapsed =
      averageWordsPerLine < settings.minAverageWordsPerLine &&
      averageCharsPerLine < settings.minAverageCharsPerLine &&
      availableCharsPerLine - averageCharsPerLine >= 8;

    if (!looksCollapsed) return null;

    return {
      issueType: 'collapsed-width',
      severity:
        averageWordsPerLine <= settings.minAverageWordsPerLine * 0.7 ||
        averageCharsPerLine <= settings.minAverageCharsPerLine * 0.7
          ? 'high'
          : 'medium',
      details: `Text wraps too aggressively (${toFixedNumber(averageWordsPerLine, 1)} words/line, ${toFixedNumber(averageCharsPerLine, 1)} chars/line) while ${Math.round(expandableContainer.widthGain)}px of extra width is available in ${expandableContainer.selector}.`,
      containerSelector: expandableContainer.selector,
      containerWidth: Math.round(expandableContainer.contentRect.width),
      widthGain: Math.round(expandableContainer.widthGain),
      widthRatio: toFixedNumber(expandableContainer.widthRatio),
      freeLeft: Math.round(expandableContainer.freeLeft),
      freeRight: Math.round(expandableContainer.freeRight),
      averageWordsPerLine: toFixedNumber(averageWordsPerLine, 1),
      averageCharsPerLine: toFixedNumber(averageCharsPerLine, 1),
      lineCount: lineMetrics.lineCount,
    };
  };

  const getNarrowHeadingIssue = (element, style, lineMetrics, expandableContainer) => {
    if (!expandableContainer) return null;

    const tag = element.tagName.toUpperCase();
    const size = Number.parseFloat(style.fontSize || '16');
    const isHeading = /^H[1-6]$/.test(tag) || size >= 22;

    if (!isHeading) return null;
    if (lineMetrics.lineCount < settings.minNarrowHeadingLineCount) return null;
    if (lineMetrics.averageCharsPerLine > settings.maxNarrowHeadingCharsPerLine) return null;
    if (expandableContainer.widthGain < settings.minNarrowHeadingWidthGain) return null;
    if (expandableContainer.widthRatio < settings.minNarrowHeadingWidthRatio) return null;

    return {
      issueType: 'narrow-heading-width',
      severity:
        lineMetrics.lineCount >= settings.minNarrowHeadingLineCount + 2 ||
        lineMetrics.averageCharsPerLine <= settings.maxNarrowHeadingCharsPerLine * 0.7
          ? 'high'
          : 'medium',
      details: `Heading wraps into ${lineMetrics.lineCount} lines at only ${toFixedNumber(lineMetrics.averageCharsPerLine, 1)} chars/line while ${Math.round(expandableContainer.widthGain)}px of extra width is available in ${expandableContainer.selector}.`,
      containerSelector: expandableContainer.selector,
      containerWidth: Math.round(expandableContainer.contentRect.width),
      widthGain: Math.round(expandableContainer.widthGain),
      widthRatio: toFixedNumber(expandableContainer.widthRatio),
      lineCount: lineMetrics.lineCount,
      averageCharsPerLine: toFixedNumber(lineMetrics.averageCharsPerLine, 1),
    };
  };

  const getClearanceIssue = (clearance, lineMetrics) => {
    if (!clearance) return null;
    if (!lineMetrics || lineMetrics.lineCount < 2) return null;

    const minimum = Math.min(clearance.left, clearance.right, clearance.top, clearance.bottom);
    if (minimum >= settings.minFrameClearance) return null;

    const failingSides = ['left', 'right', 'top', 'bottom'].filter(
      (side) => clearance[side] < settings.minFrameClearance,
    );

    return {
      issueType: 'tight-frame-spacing',
      severity: minimum < settings.minFrameClearance * 0.5 ? 'high' : 'medium',
      details: `Text sits only ${Math.round(minimum)}px from the ${failingSides.join('/')} edge(s) of ${clearance.selector}.`,
      containerSelector: clearance.selector,
      clearanceLeft: Math.round(clearance.left),
      clearanceRight: Math.round(clearance.right),
      clearanceTop: Math.round(clearance.top),
      clearanceBottom: Math.round(clearance.bottom),
      minClearance: Math.round(minimum),
      failingSides,
    };
  };

  const getSingleLineLabelClearanceIssue = (clearance, lineMetrics, style) => {
    if (!clearance) return null;
    if (!lineMetrics || lineMetrics.lineCount !== 1) return null;

    const isLabelLike =
      Number.parseFloat(style.fontSize || '16') <= 14 &&
      (Number.parseInt(style.fontWeight || '400', 10) >= 600 ||
        (style.textTransform && style.textTransform !== 'none'));

    if (!isLabelLike) return null;

    const minimum = Math.min(clearance.left, clearance.right, clearance.top, clearance.bottom);
    if (minimum >= settings.minSingleLineLabelClearance) return null;

    const failingSides = ['left', 'right', 'top', 'bottom'].filter(
      (side) => clearance[side] < settings.minSingleLineLabelClearance,
    );

    return {
      issueType: 'tight-label-spacing',
      severity: minimum < settings.minSingleLineLabelClearance * 0.5 ? 'high' : 'medium',
      details: `Label sits only ${Math.round(minimum)}px from the ${failingSides.join('/')} edge(s) of ${clearance.selector}.`,
      containerSelector: clearance.selector,
      clearanceLeft: Math.round(clearance.left),
      clearanceRight: Math.round(clearance.right),
      clearanceTop: Math.round(clearance.top),
      clearanceBottom: Math.round(clearance.bottom),
      minClearance: Math.round(minimum),
      failingSides,
    };
  };

  const createElementCandidates = () =>
    Array.from(
      document.querySelectorAll('a, p, h1, h2, h3, h4, h5, h6, li, span, strong, em, code, button, label, summary'),
    )
      .filter((element) => isVisibleLeafTextElement(element) && !matchesIgnoredSelector(element))
      .map((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const text = (element.innerText || element.textContent || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 180);

        return {
          kind: 'element',
          element,
          style,
          rect,
          text,
          selector: getSelectorHint(element),
          tag: element.tagName,
          className: String(element.className || '').slice(0, 180),
        };
      });

  const createPseudoCandidates = () =>
    Array.from(document.querySelectorAll('*'))
      .filter((element) => !matchesIgnoredSelector(element))
      .flatMap((element) =>
        ['::before', '::after']
          .map((pseudoName) => {
            const style = getComputedStyle(element, pseudoName);
            const text = getPseudoText(style);
            if (!text || text.length < settings.minTextLength) return null;
            if (style.display === 'none' || style.visibility === 'hidden') return null;
            if (Number.parseFloat(style.opacity || '1') === 0) return null;

            const rect = getPseudoRect(element, pseudoName, style);
            if (rect.width < 4 || rect.height < 8) return null;

            return {
              kind: 'pseudo',
              element,
              pseudoName,
              style,
              rect,
              text: text.slice(0, 180),
              selector: `${getSelectorHint(element)}${pseudoName}`,
              tag: `${element.tagName}${pseudoName}`,
              className: String(element.className || '').slice(0, 180),
            };
          })
          .filter(Boolean),
      );

  const getCandidateLineMetrics = (candidate) => {
    if (candidate.kind === 'pseudo') {
      const words = getWords(candidate.text);
      const characters = candidate.text.replace(/\s+/g, '').length;
      const lineCount = candidate.rect.lineCount || 1;
      const fontSize = Number.parseFloat(candidate.style.fontSize || '16') || 16;

      return {
        lineRects: [],
        bounds: candidate.rect,
        lineCount,
        words,
        wordCount: words.length,
        characters,
        averageWordsPerLine: words.length / Math.max(lineCount, 1),
        averageCharsPerLine: characters / Math.max(lineCount, 1),
        maxLineWidth: candidate.rect.width,
        minLineWidth: candidate.rect.width,
        averageLineWidth: candidate.rect.width,
        widthPerCharacter: characters > 0 ? candidate.rect.width / characters : candidate.rect.width,
        maxEstimatedCharactersPerLine:
          fontSize > 0 ? candidate.rect.width / Math.max(fontSize * 0.58, 1) : candidate.rect.width / 9,
      };
    }

    return getLineMetrics(candidate.element, candidate.rect, candidate.text, candidate.style);
  };

  const buildRow = (
    candidate,
    threshold,
    foreground,
    background,
    samplePoint,
    lineMetrics,
    clearance,
    complexSurfaceFlags,
    backgroundSource,
    backgroundLabel,
  ) => ({
    text: candidate.text,
    tag: candidate.tag,
    selector: candidate.selector,
    className: candidate.className,
    color: toRgbString(foreground),
    colorHex: toHex(foreground),
    background: toRgbString(background),
    backgroundHex: toHex(background),
    backgroundSource,
    backgroundLabel,
    contrast: Number(getContrastRatio(foreground, background).toFixed(2)),
    minimum: threshold.minimum,
    largeText: threshold.largeText,
    fontSize: candidate.style.fontSize,
    fontWeight: candidate.style.fontWeight,
    sampleX: Math.round(samplePoint.x),
    sampleY: Math.round(samplePoint.y),
    lineCount: lineMetrics.lineCount,
    averageWordsPerLine: toFixedNumber(lineMetrics.averageWordsPerLine, 1),
    averageCharsPerLine: toFixedNumber(lineMetrics.averageCharsPerLine, 1),
    maxLineWidth: Math.round(lineMetrics.maxLineWidth),
    minLineWidth: Math.round(lineMetrics.minLineWidth),
    minFrameClearance: clearance
      ? Math.round(Math.min(clearance.left, clearance.right, clearance.top, clearance.bottom))
      : null,
    collapsedWidthRisk: false,
    tightFrameSpacingRisk: false,
    complexSurface: complexSurfaceFlags.length > 0,
    complexSurfaceReasons: complexSurfaceFlags,
    needsManualReview: false,
    pseudoElement: candidate.pseudoName ?? null,
  });

  const collectNavbarControls = () =>
    Array.from(
      document.querySelectorAll(
        '.fontSwitcherSelect, .navbar__item.navbar__link, .navbar__search-input, .navbar [role="button"], .navbar button',
      ),
    ).filter((element) => {
      if (!element || matchesIgnoredSelector(element)) return false;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = element.getBoundingClientRect();
      return rect.width >= 16 && rect.height >= 16;
    });

  const createControlIssue = (element, issueType, details, extra = {}) => ({
    text: (element?.innerText || element?.value || element?.getAttribute?.('aria-label') || '').trim().slice(0, 180),
    tag: element?.tagName || 'CONTROL',
    selector: element ? getSelectorHint(element) : 'navbar',
    className: String(element?.className || '').slice(0, 180),
    color: null,
    colorHex: null,
    background: null,
    backgroundHex: null,
    backgroundSource: 'component',
    backgroundLabel: null,
    contrast: null,
    minimum: null,
    largeText: false,
    fontSize: element ? getComputedStyle(element).fontSize : null,
    fontWeight: element ? getComputedStyle(element).fontWeight : null,
    sampleX: null,
    sampleY: null,
    lineCount: null,
    averageWordsPerLine: null,
    averageCharsPerLine: null,
    maxLineWidth: null,
    minLineWidth: null,
    minFrameClearance: null,
    collapsedWidthRisk: false,
    tightFrameSpacingRisk: false,
    complexSurface: false,
    complexSurfaceReasons: [],
    needsManualReview: false,
    issueType,
    severity: 'medium',
    details,
    ...extra,
  });

  const analyzeControlGeometry = () => {
    const issues = [];
    const controls = collectNavbarControls();

    for (const control of controls) {
      const rect = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      const text = (control.innerText || control.value || control.getAttribute('aria-label') || '').trim();
      const borderRadius = Number.parseFloat(style.borderRadius || '0') || 0;
      const isPillLike = borderRadius >= 20;
      const aspectRatio = rect.height > 0 ? rect.width / rect.height : Infinity;
      const isSearch = control.matches('input.navbar__search-input');

      if (rect.height < settings.minControlHeight) {
        issues.push(
          createControlIssue(
            control,
            'control-height-too-small',
            `Control height is ${Math.round(rect.height)}px; expected at least ${settings.minControlHeight}px for navbar controls.`,
            { height: Math.round(rect.height), width: Math.round(rect.width) },
          ),
        );
      }

      if (
        isPillLike &&
        text &&
        text.length <= settings.maxShortControlChars &&
        rect.height >= settings.minControlHeight &&
        aspectRatio < settings.minPillAspectRatio
      ) {
        issues.push(
          createControlIssue(
            control,
            'cramped-pill-aspect',
            `Pill control is too close to circular at ${toFixedNumber(aspectRatio)}:1 for label "${text}".`,
            { width: Math.round(rect.width), height: Math.round(rect.height), aspectRatio: toFixedNumber(aspectRatio) },
          ),
        );
      }

      if (isSearch && window.innerWidth >= 1000 && rect.width < settings.minDesktopSearchWidth) {
        issues.push(
          createControlIssue(
            control,
            'cramped-search-width',
            `Search control is only ${Math.round(rect.width)}px wide on desktop; expected at least ${settings.minDesktopSearchWidth}px.`,
            { width: Math.round(rect.width), height: Math.round(rect.height) },
          ),
        );
      }
    }

    const heights = controls.map((control) => ({
      element: control,
      text: (control.innerText || control.value || control.getAttribute('aria-label') || control.tagName).trim(),
      height: Math.round(control.getBoundingClientRect().height),
    }));

    if (heights.length >= 2) {
      const minHeight = Math.min(...heights.map((item) => item.height));
      const maxHeight = Math.max(...heights.map((item) => item.height));
      if (maxHeight - minHeight > settings.maxNavbarControlHeightDelta) {
        issues.push(
          createControlIssue(
            null,
            'inconsistent-control-heights',
            `Navbar controls vary from ${minHeight}px to ${maxHeight}px tall, exceeding the ${settings.maxNavbarControlHeightDelta}px tolerance.`,
            {
              controls: heights.map((item) => `${item.text}:${item.height}`).join(', '),
            },
          ),
        );
      }
    }

    return issues;
  };

  const results = [];
  const failures = [];
  const manualReview = [];
  const issues = [];
  const allCandidates = [...createElementCandidates(), ...createPseudoCandidates()];

  const analyzeCandidate = (candidate) => {
    const foreground = parseColor(candidate.style.color);
    if (!foreground) return;

    const samplePoint = getSamplePoint(candidate.rect);
    const backgroundOverride = getOverrideBackground(candidate.element);
    const sampledBackground = getEffectiveBackground(candidate.element, samplePoint);
    const complexSurfaceFlags = backgroundOverride ? [] : getComplexSurfaceFlags(candidate.element);
    const fallbackSurface = backgroundOverride ? null : getReliableSurfaceBackground(candidate.element);
    const threshold = getThreshold(candidate.style);
    const lineMetrics = getCandidateLineMetrics(candidate);
    const expandableContainer = getExpandableContainer(candidate.element);
    const clearance = getFrameClearance(candidate.element, lineMetrics.bounds);
    const isCodeText = candidate.element.tagName === 'CODE';
    const sampledRatio = getContrastRatio(foreground, sampledBackground);
    const fallbackRatio = fallbackSurface ? getContrastRatio(foreground, fallbackSurface.color) : null;
    const useFallbackSurface =
      Boolean(fallbackSurface) &&
      complexSurfaceFlags.length > 0 &&
      fallbackRatio !== null &&
      fallbackRatio >= threshold.minimum + settings.manualReviewContrastBuffer;
    const background = backgroundOverride?.color ?? (useFallbackSurface ? fallbackSurface.color : sampledBackground);
    const ratio = getContrastRatio(foreground, background);
    const measureIssue = isCodeText ? null : getMeasureIssue(lineMetrics, expandableContainer);
    const narrowHeadingIssue = isCodeText ? null : getNarrowHeadingIssue(candidate.element, candidate.style, lineMetrics, expandableContainer);
    const clearanceIssue = isCodeText ? null : getClearanceIssue(clearance, lineMetrics);
    const singleLineLabelIssue = isCodeText ? null : getSingleLineLabelClearanceIssue(clearance, lineMetrics, candidate.style);

    const row = buildRow(
      candidate,
      threshold,
      foreground,
      background,
      samplePoint,
      lineMetrics,
      clearance,
      complexSurfaceFlags,
      backgroundOverride?.source ?? (useFallbackSurface ? fallbackSurface.source : 'sampled'),
      backgroundOverride?.label ?? fallbackSurface?.selector ?? null,
    );

    row.needsManualReview =
      !backgroundOverride &&
      !useFallbackSurface &&
      complexSurfaceFlags.length > 0 &&
      sampledRatio < threshold.minimum + settings.manualReviewContrastBuffer;

    row.collapsedWidthRisk = Boolean(measureIssue || narrowHeadingIssue);
    row.tightFrameSpacingRisk = Boolean(clearanceIssue || singleLineLabelIssue);
    results.push(row);

    const contrastIssue = !row.needsManualReview && ratio < threshold.minimum
      ? {
          issueType: 'contrast',
          severity: ratio < threshold.minimum * 0.75 ? 'high' : 'medium',
          details: `Contrast ratio ${toFixedNumber(ratio)} is below the required minimum of ${threshold.minimum}.`,
          contrast: toFixedNumber(ratio),
          minimum: threshold.minimum,
        }
      : null;

    for (const issue of [contrastIssue, measureIssue, narrowHeadingIssue, clearanceIssue, singleLineLabelIssue]) {
      if (!issue) continue;
      issues.push({
        ...row,
        ...issue,
      });
    }

    if (settings.failOnComplexSurfaces && row.needsManualReview) {
      manualReview.push({
        ...row,
        reviewType: 'complex-surface',
        estimatedContrast: row.contrast,
      });
      return;
    }

    if (ratio < threshold.minimum) {
      failures.push(row);
    }
  };

  for (const candidate of allCandidates) {
    analyzeCandidate(candidate);
  }

  issues.push(...analyzeControlGeometry());

  const issueCounts = issues.reduce((accumulator, issue) => {
    accumulator[issue.issueType] = (accumulator[issue.issueType] || 0) + 1;
    return accumulator;
  }, {});

  const report = {
    url: window.location.href,
    title: document.title,
    totalTextElements: results.length,
    failingTextElements: failures.length,
    manualReviewTextElements: manualReview.length,
    issueCounts,
    issues: issues.slice(0, settings.maxIssues),
    failures: failures.slice(0, settings.maxFailures),
    manualReview: manualReview.slice(0, settings.maxManualReview),
    results: settings.includePassing ? results : undefined,
  };

  if (!settings.quiet) {
    console.groupCollapsed(
      `[WCAG] ${report.failingTextElements} contrast failure(s), ${report.issues.length} total issue(s), ${report.manualReviewTextElements} manual-review text element(s) out of ${report.totalTextElements}`,
    );
    if (report.issues.length > 0) {
      console.table(report.issues);
    }
    console.table(report.failures);
    if (report.manualReview.length > 0) {
      console.table(report.manualReview);
    }
    console.groupEnd();
  }

  return report;
}

window.runWcagTextAudit = runWcagTextAudit;
