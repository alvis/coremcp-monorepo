---
title: AgentCore Gateway
description: Understand where Amazon Bedrock AgentCore Gateway fits relative to a native CoreMCP deployment.
hide_title: true
---

import {
  DocsInfoGrid,
  DocsNextLinks,
  DocsPageIntro,
} from '@site/src/components/DocsMdx';

<DocsPageIntro
  eyebrow="Integration"
  title="AgentCore Gateway"
  lead="This page is about fit, not hype. CoreMCP can sit behind Amazon Bedrock AgentCore Gateway, but the gateway should be understood as one deployment topology rather than the core identity of the system."
  tone="integration"
  summary={[
    { label: 'Good for', text: 'Centralized exposure and managed control-plane behavior.' },
    { label: 'Watch for', text: 'Gateway protocol coverage may be narrower than a native CoreMCP deployment.' },
    { label: 'Decision lens', text: 'Choose between managed integration and native protocol control.' },
  ]}
/>

## Positioning

CoreMCP should be thought of as infrastructure you can expose:

- directly as a remote MCP server
- behind a gateway or control plane when that architecture makes sense

The gateway is not the identity of the system. It is one deployment topology.

## What AWS currently documents

AWS’s current AgentCore Gateway docs say:

- Gateway supports MCP versions `2025-06-18` and `2025-03-26`
- Gateway exposes `tools/list` and `tools/call`

Source:

- [Use an AgentCore gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-using.html)

As of **April 8, 2026**, that makes Gateway a narrower story than a native full-featured remote MCP stack.

## Why the story is still moving

AWS is clearly evolving this area quickly.

Examples:

- AWS announced on **March 10, 2026** that AgentCore Runtime supports stateful MCP server features such as elicitation, sampling, and progress notifications:
  - [Amazon Bedrock AgentCore Runtime now supports stateful MCP server features](https://aws.amazon.com/about-aws/whats-new/2026/03/amazon-bedrock-agentcore-runtime-stateful-mcp/)
- An AWS blog published on **April 5, 2026** describes Authorization Code flow setup that references creating a gateway with MCP `2025-11-25` or later:
  - [Connecting MCP servers to Amazon Bedrock AgentCore Gateway using Authorization Code flow](https://aws.amazon.com/blogs/machine-learning/connecting-mcp-servers-to-amazon-bedrock-agentcore-gateway-using-authorization-code-flow/)

That combination is why this site treats Gateway as an important integration path, but not as the core identity of CoreMCP.

## Practical decision rule

<DocsInfoGrid
  items={[
    {
      title: 'Choose Gateway when',
      text: 'You want centralized exposure, managed integration, and control-plane access boundaries.',
    },
    {
      title: 'Choose direct CoreMCP deployment when',
      text: 'You want native control over the remote implementation, broader protocol surface, and explicit runtime and session handling.',
    },
  ]}
/>

<DocsNextLinks
  links={[
    { href: '/docs/deploy/aws-lambda-api-gateway', label: 'AWS Lambda + API Gateway' },
    { href: '/docs/protocol/versions-and-negotiation', label: 'Versions and negotiation' },
  ]}
/>
