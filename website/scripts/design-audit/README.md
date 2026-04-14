# Design Audit

This audit suite borrows the best operational patterns from `AuditMySite`:

- browser-first evaluation against the rendered page
- split audits with one CLI entry point
- stable `ruleId` fields for automation
- page and site level JSON summaries with score and risk

## Commands

```bash
pnpm --filter coremcp-website audit:design http://localhost:3000
pnpm --filter coremcp-website audit:design --url-file ./urls.txt
pnpm --filter coremcp-website audit:design --sitemap ./website/build/sitemap.xml
```

## What it checks

- `text`: contrast, narrow reading measure, cramped labels, control sizing carried forward from `wcag-text-audit.js`
- `structure`: document title, meta description, main landmark, skip link, heading hierarchy, image alt text, control labels, duplicate IDs
- `interaction`: tap target size and repeated generic CTA labels
- `mobile`: viewport meta, zoom restrictions, horizontal overflow, small body text, oversized fixed overlays
- `visual`: desktop hero balance, detached docs TOC rails, and mobile over-fragmentation into repeated boxed panels

## Output

The CLI writes a JSON report into `website/audit-full/` by default. The report contains:

- site-level summary with score, risk, counts, and worst pages
- per-page summaries
- per-pass data for desktop and mobile
- normalized issues with stable `ruleId`, `category`, `severity`, `summary`, and `selector`
- `manualReview` entries with AI-grounding crop targets and human-review checklist prompts
