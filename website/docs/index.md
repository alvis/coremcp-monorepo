---
title: Distributed-ready MCP for TypeScript
description: CoreMCP docs for remote HTTP MCP architecture, deployment choices, protocol coverage, and package boundaries.
hide_title: true
---

import { DocsHero } from '@site/src/components/DocsMdx';

<DocsHero
  eyebrow="Documentation"
  title="Build remote MCP with a system view, not a wrapper fantasy."
  lead="CoreMCP is a TypeScript stack for distributed MCP systems. Start here if you need a clear view of HTTP transport, protocol breadth, sessions, auth, and deployment tradeoffs."
  imageSrc="/img/brand/docs-topology-map.webp"
  imageAlt="Illustrated topology map representing distributed MCP transports and package boundaries."
  tone="orientation"
  actions={[
    { href: '/docs/why-coremcp', label: 'Start with the pitch' },
    { href: '/docs/architecture', label: 'Read the architecture', variant: 'secondary' },
  ]}
  stats={[
    { label: 'Protocol support', value: '4 versions' },
    { label: 'Workspace surface', value: '9 packages' },
    { label: 'End-to-end verification', value: '66 specs' },
  ]}
/>

## Start with the decision you need to make

<div className="docsGuideGrid">
  <a className="docsGuideCard" href="/docs/why-coremcp">
    <span className="docsGuideEyebrow">Orientation</span>
    <strong>Why does CoreMCP exist?</strong>
    <p>Read the shortest version of what the project optimizes for.</p>
  </a>

  <a className="docsGuideCard" href="/docs/distributed-mcp">
    <span className="docsGuideEyebrow">Mental model</span>
    <strong>What changes when MCP becomes distributed?</strong>
    <p>See the gap between local stdio demos and remote HTTP systems.</p>
  </a>

  <a className="docsGuideCard" href="/docs/architecture">
    <span className="docsGuideEyebrow">Package model</span>
    <strong>How is the stack split?</strong>
    <p>See how protocol, core logic, transports, and session storage are split.</p>
  </a>

  <a className="docsGuideCard" href="/docs/deploy/aws-lambda-api-gateway">
    <span className="docsGuideEyebrow">Deployment</span>
    <strong>Can this run on Lambda?</strong>
    <p>Review when API Gateway plus Lambda is a good fit.</p>
  </a>

  <a className="docsGuideCard" href="/docs/protocol/versions-and-negotiation">
    <span className="docsGuideEyebrow">Compatibility</span>
    <strong>How do versions and negotiation work?</strong>
    <p>See how multiple protocol generations stay explicit.</p>
  </a>

  <a className="docsGuideCard" href="/docs/protocol/feature-coverage">
    <span className="docsGuideEyebrow">Scope</span>
    <strong>How much of MCP is actually covered?</strong>
    <p>Check the broader protocol surface before treating it like infrastructure.</p>
  </a>
</div>

## What ships today

<div className="docsSignalBand">
  <div>
    <span className="docsSignalLabel">Transports</span>
    <p>Native stdio and HTTP paths with OAuth-aware remote HTTP support.</p>
  </div>
  <div>
    <span className="docsSignalLabel">State</span>
    <p>Session lifecycle handling, persistence abstractions, and local JSON-backed storage.</p>
  </div>
  <div>
    <span className="docsSignalLabel">Protocol breadth</span>
    <p>Prompts, resources, templates, roots, sampling, elicitation, progress, and tasks.</p>
  </div>
</div>

## Trust signals

The project is designed to help you evaluate infrastructure fit, not just API aesthetics:

- 9 workspace packages with explicit boundaries
- 4 supported protocol versions
- 74 package-level specs
- 66 end-to-end protocol specs

The docs are intentionally trust-first. They are written to help you decide whether CoreMCP fits your runtime and capability mix before you commit to an architecture.
