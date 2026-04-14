---
title: HTTP and OAuth
hide_title: true
---

import {
  DocsNextLinks,
  DocsPageIntro,
} from '@site/src/components/DocsMdx';

<DocsPageIntro
  eyebrow="Transport"
  title="HTTP and OAuth"
  lead="HTTP is the transport path that turns MCP from a local integration pattern into deployable infrastructure. In CoreMCP, HTTP is not treated as a tiny adapter. It has dedicated client and server packages because auth and transport complexity become real product concerns immediately."
  tone="transport"
  summary={[
    { label: 'Client path', text: 'OAuth flows, refresh behavior, discovery, and reconnect handling.' },
    { label: 'Server path', text: '@coremcp/server-fastify makes remote deployment first-class.' },
    { label: 'Why it matters', text: 'Remote auth and transport complexity should be modeled directly.' },
  ]}
/>

## Why this matters

HTTP is the transport path that turns MCP from a local integration technique into deployable infrastructure.

In CoreMCP, HTTP is not treated as a tiny adapter around local behavior. It has dedicated client and server transport packages.

## Client side

The HTTP client path in this repo includes explicit support for:

- OAuth-oriented flows
- token refresh behavior
- resource metadata discovery
- SSE-oriented reconnect handling

That matters because remote MCP client behavior is usually where auth and transport complexity becomes visible first.

## Server side

The server HTTP path exists through `@coremcp/server-fastify`.

Its role in the architecture is to make remote MCP deployment a first-class path rather than a sidecar afterthought.

<DocsNextLinks
  links={[
    { href: '/docs/deploy/remote-http', label: 'Remote HTTP deployment' },
    { href: '/docs/deploy/state-and-sessions', label: 'State and sessions' },
  ]}
/>
