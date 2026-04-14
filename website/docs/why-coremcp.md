---
title: Why CoreMCP
description: Why CoreMCP is built for remote HTTP MCP, explicit protocol boundaries, and distributed runtime realities.
hide_title: true
---

import {
  DocsDecision,
  DocsInfoGrid,
  DocsNextLinks,
  DocsPageIntro,
  DocsSectionCard,
} from '@site/src/components/DocsMdx';

<DocsPageIntro
  eyebrow="Orientation"
  title="Why CoreMCP exists"
  lead="CoreMCP exists for teams that need MCP to survive contact with real remote infrastructure. The project is opinionated about transport, state, negotiation, and protocol breadth because those concerns shape the product the moment you leave a local demo."
  tone="orientation"
  summary={[
    { label: 'Optimized for', text: 'Remote HTTP deployments and distributed runtimes.' },
    { label: 'Not optimized for', text: 'Hiding complexity behind a tool-call-only wrapper story.' },
    { label: 'Read next', text: 'Architecture, deployment choices, and feature coverage.' },
  ]}
/>

## The short version

CoreMCP is built around the idea that **distributed MCP is harder than local MCP**.

<DocsInfoGrid
  items={[
    {
      title: 'Local demos can get away with',
      text: 'One transport, one version, tool calling only, minimal auth assumptions, and process-local state.',
    },
    {
      title: 'Remote systems usually cannot',
      text: 'They need explicit choices about transport, auth, sessions, reconnects, and protocol compatibility.',
    },
  ]}
/>

## What CoreMCP keeps explicit

<DocsSectionCard
  items={[
    '@coremcp/protocol handles protocol versions and validation',
    '@coremcp/client and @coremcp/server handle the core interaction model',
    'transport packages keep stdio and HTTP concerns separate',
    'session support exists as a first-class concern instead of an afterthought',
  ]}
/>

## What this site is optimizing for

The docs and homepage are intentionally biased toward teams asking:

- how do we deploy MCP over HTTP?
- how much of the protocol is really covered?
- what happens when auth, sessions, and notifications matter?
- can this run behind API Gateway + Lambda, containers, or long-running services?

## What CoreMCP tries not to hide

<DocsDecision
  title="Main position"
  text="This project does not pretend that every runtime is equally good for every MCP capability mix."
/>

Examples:

- Lambda can be excellent for some remote MCP patterns
- Lambda is a worse fit when your protocol behavior wants heavier statefulness or long-lived connection semantics
- gateways are useful, but a gateway is not the same thing as a native remote MCP implementation

That realism is part of the product story, not a disclaimer buried in the fine print.

<DocsNextLinks
  links={[
    { href: '/docs/distributed-mcp', label: 'Distributed MCP' },
    { href: '/docs/architecture', label: 'Architecture' },
    { href: '/docs/protocol/feature-coverage', label: 'Feature Coverage' },
  ]}
/>
