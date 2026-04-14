---
title: Versions and Negotiation
description: Review the protocol versions CoreMCP supports and why negotiation matters in distributed MCP systems.
hide_title: true
---

import {
  DocsNextLinks,
  DocsPageIntro,
  DocsSectionCard,
} from '@site/src/components/DocsMdx';

<DocsPageIntro
  eyebrow="Protocol"
  title="Versions and Negotiation"
  lead="Protocol version compatibility is part of the platform decision, not a marketing footnote. This page explains the supported versions in the repo and why explicit negotiation matters once MCP systems are distributed."
  tone="protocol"
  summary={[
    { label: 'Supported', text: 'Four protocol generations are explicitly covered.' },
    { label: 'Implemented in', text: '@coremcp/protocol, not transport-specific glue.' },
    { label: 'Operational value', text: 'Clearer rollout boundaries and compatibility reasoning.' },
  ]}
/>

## Supported versions in this repo

CoreMCP currently supports these protocol versions:

- `2025-11-25`
- `2025-06-18`
- `2025-03-26`
- `2024-11-05`

This is implemented in `@coremcp/protocol`, not as a marketing note layered on top.

## Why this matters

The MCP ecosystem moves quickly. Teams operating real infrastructure need more than:

- a latest-only schema snapshot
- loose claims of “MCP compatible”

They need:

- explicit version support
- predictable negotiation behavior
- the ability to reason about rollout boundaries

## Negotiation strategy

<DocsSectionCard
  items={[
    'if the requested version is supported, that version is used',
    'if not, the stack falls back to the highest supported version in the supported list',
  ]}
/>

That makes the version story visible and reviewable instead of burying it in transport code.

## Why this helps distributed systems

In distributed deployments, version support can drift at the edges:

- clients update at different speeds
- gateways may expose narrower version subsets
- managed services may lag behind the latest protocol revision

A stack that treats negotiation explicitly is easier to reason about than one that simply assumes “latest.”

<DocsNextLinks
  links={[
    { href: '/docs/protocol/feature-coverage', label: 'Feature coverage' },
    { href: '/docs/integrations/agentcore-gateway', label: 'AgentCore Gateway' },
  ]}
/>
