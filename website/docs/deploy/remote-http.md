---
title: Remote HTTP Deployment
description: Use CoreMCP's native remote HTTP deployment model with explicit auth, routing, sessions, and compatibility boundaries.
hide_title: true
---

import {
  DocsInfoGrid,
  DocsNextLinks,
  DocsPageIntro,
  DocsSectionCard,
} from '@site/src/components/DocsMdx';

<DocsPageIntro
  eyebrow="Deployment"
  title="Remote HTTP Deployment"
  lead="This is the default distributed deployment story for CoreMCP. Start here if you want the cleanest framing for remote MCP: native HTTP transport, explicit auth boundaries, and a session strategy chosen for the runtime."
  tone="deployment"
  summary={[
    { label: 'Recommended path', text: 'Native MCP server over remote HTTP.' },
    { label: 'What it makes explicit', text: 'Auth, routing, reconnects, and version compatibility.' },
    { label: 'Common runtimes', text: 'Lambda, containers, and long-running HTTP services.' },
  ]}
/>

## Recommended story

<DocsSectionCard
  items={[
    'native MCP server',
    'remote HTTP transport',
    'explicit auth boundary',
    'session and state strategy chosen for the runtime',
  ]}
/>

That is the framing this site prefers over “just wrap a local stdio server and hope the remote behavior still maps cleanly.”

## Why remote HTTP is the first-class path

Remote MCP needs infrastructure-aware choices:

- request routing
- auth
- session identity
- reconnect and retry behavior
- version compatibility

CoreMCP’s HTTP-oriented packages make that path visible instead of forcing it through a local-process abstraction.

## Good fits

<DocsInfoGrid
  items={[
    {
      title: 'Use remote HTTP when',
      text: 'Clients need a stable remote endpoint, auth matters, and deployment topology is part of the design.',
    },
    {
      title: 'Why it helps',
      text: 'It keeps protocol logic separate from runtime topology instead of hiding everything behind process assumptions.',
    },
  ]}
/>

## Runtime shapes

Common runtime options:

- Lambda + API Gateway
- containerized services
- long-running HTTP processes

The right choice depends on how much statefulness and connection continuity your capability mix expects.

<DocsNextLinks
  links={[
    { href: '/docs/deploy/aws-lambda-api-gateway', label: 'AWS Lambda + API Gateway' },
    { href: '/docs/deploy/state-and-sessions', label: 'State and sessions' },
    { href: '/docs/transports/http-oauth', label: 'HTTP and OAuth transport' },
  ]}
/>
