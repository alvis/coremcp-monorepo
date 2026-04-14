---
title: AWS Lambda + API Gateway
description: Evaluate when AWS Lambda and API Gateway fit a CoreMCP remote HTTP deployment and when they start to fight session behavior.
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
  eyebrow="Deployment"
  title="AWS Lambda + API Gateway"
  lead="Lambda is a credible remote MCP deployment target when the runtime fits the behavior you need. This page is not trying to sell Lambda universally. It is here to help you decide where it works well and where it starts to fight the protocol shape."
  tone="deployment"
  summary={[
    { label: 'Strong when', text: 'Traffic is bursty and state can be externalized cleanly.' },
    { label: 'Weak when', text: 'Behavior depends on richer in-memory continuity.' },
    { label: 'CoreMCP stance', text: 'Treat Lambda as a deployment target, not the identity of the stack.' },
  ]}
/>

## Opinionated summary

<DocsInfoGrid
  items={[
    {
      title: 'Lambda is a strong option when',
      text: 'You want remote HTTP MCP quickly, traffic is bursty, and your capability mix is compatible with stateless or externally persisted behavior.',
    },
    {
      title: 'Lambda is a weaker option when',
      text: 'Your server behavior depends on heavier in-memory state or runtime patterns that map better to long-lived HTTP processes.',
    },
  ]}
/>

## Recommended CoreMCP framing

<DocsSectionCard
  items={[
    'build a native remote MCP server over HTTP',
    'place it behind API Gateway + Lambda when the behavior fits',
    'push session and state into an external store when persistence is required',
  ]}
/>

## What existing AWS solutions show

### 1. Lambda wrapper approach

AWS provides an official wrapper for running MCP servers with Lambda:

- [awslabs/run-model-context-protocol-servers-with-aws-lambda](https://github.com/awslabs/run-model-context-protocol-servers-with-aws-lambda)

Why it matters:

- it validates that Lambda is a real MCP deployment target
- it also shows the limits of a wrapper-first model

The repo is positioned around wrapping existing stdio MCP servers for Lambda execution. That is useful, but it is a narrower story than a native remote MCP stack.

### 2. AWS deployment guidance

AWS also publishes deployment guidance for remote MCP servers on AWS:

- [Guidance for Deploying Model Context Protocol Servers on AWS](https://github.com/aws-solutions-library-samples/guidance-for-deploying-model-context-protocol-servers-on-aws)

Useful signals from that guidance:

- secure remote hosting matters
- OAuth and protected resource metadata matter
- Streamable HTTP matters
- both Lambda and containers are credible runtime options

## Good fit / bad fit

### Good fit for Lambda

- tool-centric remote workflows
- request-driven remote HTTP serving
- scale-to-zero economics or sporadic usage
- systems where session and state can be externalized cleanly

### Bad fit for Lambda

- protocol behaviors that assume richer in-memory continuity
- workloads that behave more like long-lived service processes
- systems where serverless cold starts or execution boundaries create too much friction

## State and sessions

<DocsDecision
  title="Main design rule"
  text="If you deploy CoreMCP behind Lambda and still want richer remote behavior, session IDs, external storage, and resumable behavior handling are not optional. They are the difference between a demo and a distributed system."
/>

Plan for:

- session IDs as explicit protocol and runtime boundaries
- an external session store
- careful treatment of long-running operations, notifications, and resumable behavior

<DocsNextLinks
  links={[
    { href: '/docs/deploy/state-and-sessions', label: 'State and sessions' },
    { href: '/docs/integrations/agentcore-gateway', label: 'AgentCore Gateway' },
  ]}
/>
