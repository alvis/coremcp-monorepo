---
title: State and Sessions
description: Decide how CoreMCP sessions, reconnect behavior, and persistence should work across distributed runtimes.
hide_title: true
---

import {
  DocsDecision,
  DocsNextLinks,
  DocsPageIntro,
  DocsSectionCard,
} from '@site/src/components/DocsMdx';

<DocsPageIntro
  eyebrow="Deployment"
  title="State and Sessions"
  lead="Distributed MCP often fails because teams treat it as a transport-only problem. This page exists to force the other half of the conversation: session continuity, persistence, reconnect behavior, and user context."
  tone="deployment"
  summary={[
    { label: 'Main question', text: 'How much continuity does your server need across requests?' },
    { label: 'Serverless impact', text: 'Assume in-memory state is ephemeral.' },
    { label: 'CoreMCP signal', text: 'Session handling is already separated from transport.' },
  ]}
/>

## Why this page exists

Distributed MCP often fails at the architecture level because teams treat it as a transport-only problem.

It is also a state problem.

## Questions to ask

Ask these questions before choosing a runtime:

- do we need session continuity across multiple interactions?
- do we need progress or task state visible across requests?
- do we need reconnect-aware behavior?
- do we need user context to survive beyond one invocation?

If the answer is yes, your deployment needs a session strategy.

## CoreMCP’s shape

<DocsSectionCard
  items={[
    'session handling exists in the core and server layers',
    '@coremcp/session-local proves that session persistence is a separate concern from transport',
  ]}
/>

That separation is important because distributed deployments usually want a storage backend other than local JSON files.

## Runtime consequences

### In serverless environments

- in-memory state is ephemeral
- persistence must be externalized
- session identity and storage boundaries must be explicit

### In containerized or long-running services

You still need a session model, but you may have more flexibility in how you manage stateful behavior.

## The main design rule

<DocsDecision
  title="Choose the runtime second"
  text="If your MCP server wants to behave like a multi-step remote system, design sessions first and choose the runtime second."
/>

<DocsNextLinks
  links={[
    { href: '/docs/deploy/remote-http', label: 'Remote HTTP deployment' },
    { href: '/docs/deploy/aws-lambda-api-gateway', label: 'AWS Lambda + API Gateway' },
  ]}
/>
