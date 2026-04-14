---
title: STDIO
hide_title: true
---

import {
  DocsDecision,
  DocsNextLinks,
  DocsPageIntro,
} from '@site/src/components/DocsMdx';

<DocsPageIntro
  eyebrow="Transport"
  title="STDIO"
  lead="STDIO remains an important part of the MCP story for local development and process-based composition. CoreMCP keeps it explicit, but it also refuses to pretend that local stdio and distributed HTTP are the same deployment problem."
  tone="transport"
  summary={[
    { label: 'Strong for', text: 'Local development and classic process-based integration.' },
    { label: 'Not the same as', text: 'Remote HTTP deployment, auth, and stateful runtime topology.' },
    { label: 'CoreMCP choice', text: 'Keep stdio and HTTP as separate transport paths.' },
  ]}
/>

## What STDIO is good at

- local development
- process-based server composition
- environments where spawning a local server is the simplest integration path

## What this site wants you to notice

<DocsDecision
  title="Main point"
  text="CoreMCP keeps stdio and HTTP as separate transport paths because stdio is not remote HTTP, and remote deployment introduces concerns stdio does not need to solve."
/>

The point is not to downplay stdio. The point is to avoid pretending it maps one-to-one onto distributed deployment.

<DocsNextLinks
  links={[
    { href: '/docs/distributed-mcp', label: 'Distributed MCP' },
    { href: '/docs/deploy/remote-http', label: 'Remote HTTP deployment' },
  ]}
/>
