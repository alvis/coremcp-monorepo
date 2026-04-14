---
title: Package Reference
description: Quick map of CoreMCP protocol, core, client, server, and session packages before implementation.
hide_title: true
---

import {
  DocsNextLinks,
  DocsPageIntro,
} from '@site/src/components/DocsMdx';

<DocsPageIntro
  eyebrow="Reference"
  title="Package Reference"
  lead="Use this page as the quick map of workspace packages. It is intentionally brief: the goal is to help you choose the right package boundary before you dive into implementation detail."
  tone="reference"
  summary={[
    { label: 'Protocol', text: 'Wire contract, validation, version support.' },
    { label: 'Core', text: 'Shared primitives and session boundaries.' },
    { label: 'Clients / Servers', text: 'Native behavior plus transport-specific HTTP and stdio packages.' },
  ]}
/>

## Protocol

### `@coremcp/protocol`

<div className="docsPageSectionCard">
  <ul>
    <li>protocol types</li>
    <li>validation</li>
    <li>version support and negotiation</li>
  </ul>
</div>

## Core

### `@coremcp/core`

<div className="docsPageSectionCard">
  <ul>
    <li>shared primitives</li>
    <li>session concerns</li>
    <li>common utilities</li>
  </ul>
</div>

### `@coremcp/session-local`

<div className="docsPageSectionCard">
  <ul>
    <li>local JSON-backed session persistence</li>
    <li>proving session storage can live outside the transport layer</li>
  </ul>
</div>

## Client

### `@coremcp/client`

<div className="docsPageSectionCard">
  <ul>
    <li>native client behavior</li>
    <li>multi-server and client-side orchestration concerns</li>
  </ul>
</div>

### `@coremcp/client-http`

<div className="docsPageSectionCard">
  <ul>
    <li>remote HTTP client behavior</li>
    <li>auth-aware HTTP client flows</li>
  </ul>
</div>

### `@coremcp/client-stdio`

<div className="docsPageSectionCard">
  <ul>
    <li>local process-based client transport</li>
  </ul>
</div>

## Server

### `@coremcp/server`

<div className="docsPageSectionCard">
  <ul>
    <li>native server behavior</li>
    <li>shared server-side protocol handling</li>
  </ul>
</div>

### `@coremcp/server-fastify`

<div className="docsPageSectionCard">
  <ul>
    <li>remote HTTP server deployment</li>
  </ul>
</div>

### `@coremcp/server-stdio`

<div className="docsPageSectionCard">
  <ul>
    <li>local process-based MCP servers</li>
  </ul>
</div>

<DocsNextLinks
  links={[
    { href: '/docs/architecture', label: 'Architecture' },
    { href: '/docs/deploy/remote-http', label: 'Remote HTTP Deployment' },
    { href: '/docs/transports/stdio', label: 'STDIO' },
  ]}
/>
