#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import { createSiteReport, slugify } from './design-audit/lib/report.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const websiteRoot = resolve(__dirname, '..');

const SCRIPT_FILES = [
  resolve(__dirname, 'wcag-text-audit.js'),
  resolve(__dirname, 'semantic-structure-audit.js'),
  resolve(__dirname, 'interaction-audit.js'),
  resolve(__dirname, 'mobile-layout-audit.js'),
  resolve(__dirname, 'visual-layout-audit.js'),
  resolve(__dirname, 'design-audit.js'),
];

function printUsage() {
  console.log(`Usage:
  pnpm --filter coremcp-website audit:design <url>
  pnpm --filter coremcp-website audit:design --url-file ./urls.txt
  pnpm --filter coremcp-website audit:design --sitemap https://example.com/sitemap.xml

Options:
  --output <path>        Write JSON report to a file
  --url-file <path>      Read newline-separated URLs from a file
  --sitemap <url|path>   Read URLs from a sitemap
  --max-pages <n>        Limit the number of audited URLs
  --browser-path <path>  Explicit Chrome/Chromium binary
  --timeout <ms>         Navigation timeout in milliseconds (default: 30000)
  --desktop-only         Skip the mobile pass
  --mobile-only          Skip the desktop pass
  --headed               Run with a visible browser window
  --wait-until <event>   Playwright waitUntil value (default: networkidle)
`);
}

function parseArgs(argv) {
  const args = {
    urls: [],
    output: null,
    urlFile: null,
    sitemap: null,
    maxPages: null,
    browserPath: process.env.CHROME_PATH || null,
    timeout: 30000,
    headed: false,
    desktop: true,
    mobile: true,
    waitUntil: 'networkidle',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    switch (value) {
      case '--':
        break;
      case '--output':
        args.output = argv[++index];
        break;
      case '--url-file':
        args.urlFile = argv[++index];
        break;
      case '--sitemap':
        args.sitemap = argv[++index];
        break;
      case '--max-pages':
        args.maxPages = Number.parseInt(argv[++index], 10);
        break;
      case '--browser-path':
        args.browserPath = argv[++index];
        break;
      case '--timeout':
        args.timeout = Number.parseInt(argv[++index], 10);
        break;
      case '--desktop-only':
        args.mobile = false;
        break;
      case '--mobile-only':
        args.desktop = false;
        break;
      case '--headed':
        args.headed = true;
        break;
      case '--wait-until':
        args.waitUntil = argv[++index];
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        if (value.startsWith('--')) {
          throw new Error(`Unknown option: ${value}`);
        }

        args.urls.push(value);
    }
  }

  return args;
}

function detectBrowserPath(explicitPath) {
  if (explicitPath && existsSync(explicitPath)) return explicitPath;

  const knownPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];

  for (const path of knownPaths) {
    if (existsSync(path)) return path;
  }

  for (const command of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      const resolvedCommand = execFileSync('which', [command], { encoding: 'utf8' }).trim();
      if (resolvedCommand) return resolvedCommand;
    } catch {}
  }

  throw new Error('Could not find a Chrome/Chromium binary. Pass --browser-path or set CHROME_PATH.');
}

async function readUrlsFromFile(path) {
  const content = await readFile(resolve(process.cwd(), path), 'utf8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'));
}

async function readUrlsFromSitemap(source) {
  const rawContent = source.startsWith('http://') || source.startsWith('https://')
    ? await fetch(source).then((response) => {
        if (!response.ok) throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
        return response.text();
      })
    : await readFile(resolve(process.cwd(), source), 'utf8');

  return Array.from(rawContent.matchAll(/<loc>(.*?)<\/loc>/gsi)).map((match) => match[1].trim());
}

async function resolveTargets(args) {
  let urls = [...args.urls];
  let target = { type: 'url', input: args.urls[0] || null };

  if (args.urlFile) {
    urls = await readUrlsFromFile(args.urlFile);
    target = { type: 'url-file', input: args.urlFile };
  } else if (args.sitemap) {
    urls = await readUrlsFromSitemap(args.sitemap);
    target = { type: 'sitemap', input: args.sitemap };
  }

  urls = Array.from(new Set(urls));

  if (args.maxPages && Number.isFinite(args.maxPages)) {
    urls = urls.slice(0, args.maxPages);
  }

  if (urls.length === 0) {
    throw new Error('No URLs provided. Pass a URL, --url-file, or --sitemap.');
  }

  return { target, urls };
}

async function injectAuditScripts(page) {
  for (const scriptPath of SCRIPT_FILES) {
    const content = await readFile(scriptPath, 'utf8');
    await page.addScriptTag({ content });
  }
}

async function runPass(page, { name, viewport, categories, timeout, waitUntil }) {
  await page.setViewportSize(viewport);
  await page.goto(page.url(), {
    timeout,
    waitUntil,
  });
  await injectAuditScripts(page);

  return page.evaluate(
    ({ passName, passCategories }) => {
      const result = window.runDesignAudit({
        quiet: true,
        categories: passCategories,
      });

      return {
        ...result,
        name: passName,
      };
    },
    { passName: name, passCategories: categories },
  );
}

function getManualReviewEntries(pass) {
  return Object.values(pass.categories || {}).flatMap((category) => category.manualReview || []);
}

async function captureManualReviewArtifacts(page, pass, outputPath, pageSlug) {
  const entries = getManualReviewEntries(pass);
  if (entries.length === 0) return;

  const outputDir = join(dirname(outputPath), 'manual-review');
  await mkdir(outputDir, { recursive: true });

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const selector = entry?.aiGrounding?.selector || entry.selector;
    if (!selector || selector.includes('::')) continue;

    try {
      const locator = page.locator(selector).first();
      const count = await locator.count();
      if (count === 0) continue;

      const box = await locator.boundingBox();
      if (!box) continue;

      const padding = entry?.aiGrounding?.cropPadding ?? 20;
      const clip = {
        x: Math.max(0, box.x - padding),
        y: Math.max(0, box.y - padding),
        width: Math.min(page.viewportSize()?.width ?? box.width, box.width + padding * 2),
        height: Math.min(page.viewportSize()?.height ?? box.height, box.height + padding * 2),
      };

      const cropPath = join(outputDir, `${pageSlug}-${pass.name}-${index + 1}.png`);
      await page.screenshot({ path: cropPath, clip });
      entry.aiGrounding = {
        ...entry.aiGrounding,
        cropPath,
      };
    } catch {}
  }
}

function getDefaultOutputPath(targetInput) {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `design-audit-${slugify(targetInput)}-${date}.json`;
  return join(websiteRoot, 'audit-full', filename);
}

function logPageSummary(pageReport) {
  const { countsBySeverity } = pageReport;
  const severitySummary = ['critical', 'high', 'medium', 'low']
    .filter((severity) => countsBySeverity[severity])
    .map((severity) => `${severity}:${countsBySeverity[severity]}`)
    .join(', ');

  console.log(
    `${pageReport.score.toString().padStart(3, ' ')}  ${pageReport.risk.level.toUpperCase().padEnd(8, ' ')}  ${pageReport.issueCount
      .toString()
      .padStart(3, ' ')} issues  ${pageReport.url}${severitySummary ? `  (${severitySummary})` : ''}`,
  );
}

async function auditUrl(browser, url, args) {
  const page = await browser.newPage();
  await page.goto(url, {
    timeout: args.timeout,
    waitUntil: args.waitUntil,
  });

  const passes = [];

  if (args.desktop) {
    const desktopPass = await runPass(page, {
        name: 'desktop',
        viewport: { width: 1440, height: 900 },
        categories: ['text', 'structure', 'interaction', 'visual'],
        timeout: args.timeout,
        waitUntil: args.waitUntil,
      });
    passes.push(desktopPass);
  }

  if (args.mobile) {
    const mobilePass = await runPass(page, {
        name: 'mobile',
        viewport: { width: 390, height: 844 },
        categories: ['text', 'interaction', 'mobile', 'visual'],
        timeout: args.timeout,
        waitUntil: args.waitUntil,
      });
    passes.push(mobilePass);
  }

  await page.close();

  return {
    url,
    title: passes.find((pass) => pass.title)?.title || url,
    passes,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { target, urls } = await resolveTargets(args);
  const browserPath = detectBrowserPath(args.browserPath);
  const outputPath = args.output
    ? resolve(process.cwd(), args.output)
    : getDefaultOutputPath(target.input || urls[0]);

  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: !args.headed,
  });

  try {
    const pages = [];

    for (const url of urls) {
      pages.push(await auditUrl(browser, url, args));
    }

    const report = createSiteReport({
      target: {
        ...target,
        urlCount: urls.length,
      },
      pages,
      metadata: {
        browserPath,
        desktopPassEnabled: args.desktop,
        mobilePassEnabled: args.mobile,
      },
    });

    for (const pageReport of report.pages) {
      const pageSlug = slugify(pageReport.url);
      const capturePage = await browser.newPage();
      try {
        await capturePage.goto(pageReport.url, {
          timeout: args.timeout,
          waitUntil: args.waitUntil,
        });

        for (const pass of pageReport.passes) {
          const viewport = pass.name === 'mobile'
            ? { width: 390, height: 844 }
            : { width: 1440, height: 900 };
          await capturePage.setViewportSize(viewport);
          await capturePage.goto(pageReport.url, {
            timeout: args.timeout,
            waitUntil: args.waitUntil,
          });
          await captureManualReviewArtifacts(capturePage, pass, outputPath, pageSlug);
        }
      } finally {
        await capturePage.close();
      }
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2));

    console.log('Score Risk     Issues URL');
    for (const page of report.pages) {
      logPageSummary(page);
    }
    console.log('');
    console.log(
      `Average score ${report.summary.averageScore}, ${report.summary.issueCount} total issues, overall risk ${report.summary.risk.level.toUpperCase()}.`,
    );
    console.log(`Report written to ${outputPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
