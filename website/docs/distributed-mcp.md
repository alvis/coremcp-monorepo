---
title: Distributed MCP
description: Understand how remote MCP changes transport, auth, state, reconnects, and runtime topology decisions.
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
  eyebrow="Mental model"
  title="Distributed MCP is a system design problem"
  lead="This page is for reasoning about MCP as a remote system with transport, auth, state, reconnects, and runtime topology. That shift in framing is the main reason CoreMCP is split the way it is."
  tone="mental-model"
  summary={[
    { label: 'Local MCP', text: 'Mostly process orchestration and local trust boundaries.' },
    { label: 'Remote MCP', text: 'Transport, identity, persistence, and compatibility choices.' },
    { label: 'CoreMCP bias', text: 'Keep those choices explicit instead of wrapping them away.' },
  ]}
/>

## Local MCP vs remote MCP

<DocsInfoGrid
  items={[
    {
      title: 'Local stdio MCP is mostly about',
      text: 'Process spawning, request/response flow, and local trust boundaries.',
    },
    {
      title: 'Remote MCP over HTTP adds',
      text: 'Transport boundaries, auth, session design, reconnect behavior, routing, and runtime constraints.',
    },
  ]}
/>

## What “distributed-ready” means here

For CoreMCP, distributed-ready means the stack is shaped around:

- remote HTTP transport as a first-class path
- explicit auth boundaries
- session lifecycle handling
- richer protocol behaviors beyond tool calls
- multiple protocol versions with negotiation

## Why this matters

<DocsDecision
  title="Common failure mode"
  text="Many remote MCP stories narrow the protocol down to tools/list and tools/call. That can be enough for some products, but it is not the same thing as keeping the richer MCP model available."
/>

CoreMCP is aimed at teams that want room for:

- resources and prompts
- sampling and elicitation
- progress updates
- task workflows
- list change notifications
- structured tool output

## Where CoreMCP fits

<DocsSectionCard
  items={[
    'local stdio MCP',
    'remote HTTP MCP',
    'distributed session-aware MCP systems',
  ]}
/>

That makes it a better fit for infrastructure decisions than a stack that only models local servers or only exposes a reduced MCP subset.

<DocsNextLinks
  links={[
    { href: '/docs/architecture', label: 'Architecture' },
    { href: '/docs/deploy/remote-http', label: 'Remote HTTP Deployment' },
    { href: '/docs/deploy/state-and-sessions', label: 'State and Sessions' },
  ]}
/>
