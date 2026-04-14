---
title: Architecture
description: Explore CoreMCP's layered architecture across protocol, core runtime, and transport-specific client and server packages.
hide_title: true
---

import {
  DocsDecision,
  DocsNextLinks,
  DocsPageIntro,
} from '@site/src/components/DocsMdx';

<DocsPageIntro
  eyebrow="Package model"
  title="Architecture"
  lead="CoreMCP is split into focused layers so protocol concerns, transport concerns, and session concerns stay visible. This page is the quickest way to understand how the monorepo makes that separation concrete."
  tone="package-model"
  summary={[
    { label: 'Protocol', text: 'Types, schemas, validation, and version negotiation.' },
    { label: 'Core', text: 'Shared runtime logic and session lifecycle boundaries.' },
    { label: 'Transports', text: 'Separate client/server paths for HTTP and stdio.' },
  ]}
/>

## Layered package model

### Protocol layer

<div className="docsPageSectionCard">
  <strong>Packages</strong>
  <ul>
    <li><code>@coremcp/protocol</code></li>
  </ul>
  <strong>Purpose</strong>
  <ul>
    <li>protocol types</li>
    <li>runtime validation</li>
    <li>version support and negotiation</li>
  </ul>
</div>

### Core layer

<div className="docsPageSectionCard">
  <strong>Packages</strong>
  <ul>
    <li><code>@coremcp/core</code></li>
    <li><code>@coremcp/session-local</code></li>
  </ul>
  <strong>Purpose</strong>
  <ul>
    <li>shared session and utility primitives</li>
    <li>storage and session lifecycle boundaries</li>
    <li>local JSON-backed persistence adapter</li>
  </ul>
</div>

### Client layer

<div className="docsPageSectionCard">
  <strong>Packages</strong>
  <ul>
    <li><code>@coremcp/client</code></li>
    <li><code>@coremcp/client-http</code></li>
    <li><code>@coremcp/client-stdio</code></li>
  </ul>
  <strong>Purpose</strong>
  <ul>
    <li>native MCP client behavior</li>
    <li>remote HTTP client path with OAuth-related support</li>
    <li>stdio connector path</li>
  </ul>
</div>

### Server layer

<div className="docsPageSectionCard">
  <strong>Packages</strong>
  <ul>
    <li><code>@coremcp/server</code></li>
    <li><code>@coremcp/server-fastify</code></li>
    <li><code>@coremcp/server-stdio</code></li>
  </ul>
  <strong>Purpose</strong>
  <ul>
    <li>server message handling</li>
    <li>HTTP transport path for remote deployment</li>
    <li>stdio path for local/process-based usage</li>
  </ul>
</div>

## Architectural bias

<DocsDecision
  title="Product statement"
  text="Protocol concerns should not be hidden in transport code, session concerns should not be smuggled into one-off handlers, and stdio and HTTP are different enough to deserve separate packages."
/>

## Distributed deployment reading

<DocsNextLinks
  links={[
    { href: '/docs/deploy/remote-http', label: 'Remote HTTP deployment' },
    { href: '/docs/deploy/aws-lambda-api-gateway', label: 'AWS Lambda + API Gateway' },
    { href: '/docs/deploy/state-and-sessions', label: 'State and sessions' },
  ]}
/>
