---
title: Feature Coverage
description: See which MCP capabilities CoreMCP implements and why broader protocol coverage affects product and infrastructure choices.
hide_title: true
---

import {
  DocsDecision,
  DocsNextLinks,
  DocsPageIntro,
} from '@site/src/components/DocsMdx';

<DocsPageIntro
  eyebrow="Protocol"
  title="Feature Coverage"
  lead="This page answers a simple question: how much of MCP is the repo actually built around? The important part is not the checklist itself. It is what the checklist implies about product and infrastructure decisions later."
  tone="protocol"
  summary={[
    { label: 'Short answer', text: 'CoreMCP is not shaped around tool calling only.' },
    { label: 'Why it matters', text: 'Broader protocol coverage preserves future room for richer workflows.' },
    { label: 'Decision impact', text: 'Coverage should matter during stack selection, not after it.' },
  ]}
/>

## Core point

The repo contains explicit support for broader MCP behavior, including:

- tools
- resources
- resource templates
- prompts
- roots
- sampling
- elicitation
- progress notifications
- list-changed notifications
- tasks
- structured tool output

## Why this is important

<DocsDecision
  title="Common narrowing"
  text="A lot of remote MCP discussion narrows the protocol to tools/list and tools/call. That may be enough for some gateway or API-translation scenarios, but it is not the full protocol surface."
/>

If your system may later need:

- richer user interaction
- task workflows
- structured outputs
- client/server coordination beyond one-off calls

then the broader feature surface should matter during stack selection, not after it.

## Coverage as positioning

The point is not to implement features for their own sake.

The point is to avoid designing yourself into a corner by starting from a tool-call-only mental model.

<DocsNextLinks
  links={[
    { href: '/docs/protocol/versions-and-negotiation', label: 'Versions and negotiation' },
    { href: '/docs/distributed-mcp', label: 'Distributed MCP' },
  ]}
/>
