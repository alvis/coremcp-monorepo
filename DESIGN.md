# CoreMCP Docs Website Design

## Product Narrative

CoreMCP should be positioned as the full-spec, distributed-ready MCP stack for TypeScript.

The website must not feel like a generic package landing page. It should make a stronger claim:

- CoreMCP is meant for remote MCP deployment, not just local stdio demos.
- CoreMCP covers the full MCP surface across all protocol versions implemented in this repo.
- CoreMCP gives teams a practical path to remote HTTP deployment on API Gateway + Lambda, containers, or long-running services without collapsing MCP down to tool calling only.

The message should be trust-first. Visitors should leave the hero with these conclusions:

1. This project understands the hard parts of distributed MCP.
2. This codebase covers more of the protocol than thin wrappers and gateway-only approaches.
3. This is credible for production architecture decisions.

## Repo Truth to Anchor On

Every major claim on the site should map back to repo evidence:

- 9 workspace packages
- 4 protocol versions in `@coremcp/protocol`
- 291 TypeScript source files under `packages/`
- 74 package-level specs
- 66 end-to-end specs
- HTTP transport, stdio transport, OAuth support, session support, and local session persistence are present in the repo

The site must avoid these claims because the repo does not currently support them clearly:

- a published CLI story
- npm-ready install instructions implying public package availability
- AWS-specific identity for the project

## Distributed-First Positioning

### Core Promise

CoreMCP is the stack for teams who need MCP to survive real infrastructure:

- remote HTTP transport
- auth and token lifecycle
- state and session persistence
- spec-version negotiation
- progress, tasks, notifications, and richer server-to-client behavior

### Competitive Framing

The site should compare CoreMCP against categories, not attack named projects.

Use this framing:

- Thin wrappers: useful for local demos, incomplete for distributed deployment
- Gateway products: useful for central exposure of tools, narrower than a native full-featured MCP implementation
- CoreMCP: native remote MCP with richer protocol coverage and explicit transport/auth/session layers

### AWS Story

AWS should be presented as the most recognizable example of distributed MCP deployment, not as the product identity.

The recommended AWS story:

- deploy a native remote MCP server over HTTP
- use API Gateway + Lambda when the capability mix is a fit
- use external state/session storage for distributed operation
- move to containers or long-running services when stateful behavior or continuous connection semantics become a poor Lambda fit

AWS references to cite in docs:

- `awslabs/run-model-context-protocol-servers-with-aws-lambda`
- `aws-solutions-library-samples/guidance-for-deploying-model-context-protocol-servers-on-aws`
- Amazon Bedrock AgentCore Gateway docs
- AWS AgentCore Gateway and AgentCore Runtime announcements/blog posts

### AgentCore Position

AgentCore Gateway is important enough to deserve a docs page, but it should remain a secondary integration story.

Key site message:

- CoreMCP is infrastructure you can expose directly or place behind a gateway
- Gateway is not the same thing as a native full remote MCP server
- current AWS Gateway docs focus on MCP versions `2025-06-18` and `2025-03-26` with `tools/list` and `tools/call`
- newer AWS posts show the ecosystem is moving, but the central website story should remain broader than one managed service

## Audience

Primary audience:

- platform engineers
- AI infrastructure engineers
- backend engineers building MCP servers
- teams evaluating how to move MCP beyond local development

Secondary audience:

- open-source contributors
- developers comparing TypeScript MCP stacks
- teams evaluating AWS/Gateway/serverless deployment options

## Conversion Goal

The homepage should drive visitors into one of two flows:

1. architecture and deployment evaluation
2. docs exploration of protocol/version/feature coverage

Primary CTA:

- `Explore the architecture`

Secondary CTA:

- `See deployment guides`

Tertiary ambient CTA:

- GitHub repo link in navbar and footer

## Homepage Information Architecture

Section order:

1. sticky glass navbar
2. hero
3. proof strip
4. why remote MCP is hard
5. why CoreMCP is different
6. AWS and serverless reality check
7. spec compliance by version
8. beyond `tools/list` and `tools/call`
9. package atlas / architecture
10. auth, sessions, and state
11. quick-start code shape
12. final CTA footer

## Homepage Section Details

### 1. Navbar

Requirements:

- glass / blurred sticky surface
- logo on the left
- links: Docs, Architecture, Deployment, GitHub
- search on docs pages via Docusaurus local search

Behavior:

- active state visible
- no clutter
- mobile drawer still keeps the primary architecture/deployment path obvious

### 2. Hero

Headline direction:

- full-spec MCP for distributed runtimes
- deploy remote MCP without shrinking the protocol

Subheadline direction:

- emphasize remote HTTP, spec coverage, version negotiation, OAuth, sessions, and richer server behaviors

Hero proof chips:

- 4 protocol versions
- HTTP + stdio
- OAuth + sessions
- tasks + notifications

Hero visual:

- abstract topology, not dashboard UI
- nested rounded-square frames inspired by the logo
- transport lanes and signal nodes
- orange core representing active capability execution
- subtle route-line overlays implying distributed coordination

Hero CTA treatment:

- primary CTA should be the strongest orange element in the hero
- secondary CTA should be outlined navy/steel-blue

### 3. Proof Strip

Four cards:

- `4 protocol versions`
- `9 focused packages`
- `66 e2e specs`
- `HTTP + OAuth + sessions + SSE`

Design:

- compact, scannable, visually louder than plain statistics
- use tokenized card styles and slight motion on hover

### 4. Why Remote MCP Is Hard

Objective:

- make the visitor feel seen
- name the real engineering tensions before pitching the solution

Topics:

- stateless runtimes vs sessionful protocol behavior
- HTTP transport vs stdio assumptions
- auth and token lifecycle
- progress, tasks, and notifications
- version drift across the ecosystem

Design:

- tension cards arranged inside nested frame shells
- route-line graphics showing friction points
- each pain point gets one sentence, not a paragraph wall

## Typography

CoreMCP uses `Ioskeley Mono` as the primary website typeface.

Rules:

- all primary UI typography should default to `Ioskeley Mono`
- headings, body copy, navigation, buttons, labels, and code should all inherit from the `Ioskeley Mono` stack unless there is an explicit exception documented here
- do not introduce `Instrument Sans`, `Space Grotesk`, Inter, or other replacement display/body systems as the default site typography
- fallback fonts may exist in the stack for loading resilience, but the intended rendered face is `Ioskeley Mono`

Reasoning:

- the type system should match the product identity already established by the logo and visual language
- typography consistency is a brand rule, not a page-level styling preference
- future visual refinements should improve spacing, hierarchy, contrast, and weight while preserving `Ioskeley Mono` as the default face

### 5. Why CoreMCP Is Different

This is the main differentiator grid.

Messages:

- protocol types plus validation
- version negotiation
- native client and server layers
- HTTP and stdio transport packages
- OAuth-aware HTTP support
- session infrastructure
- local persistence adapter

Tone:

- factual
- grounded in repo capabilities
- no exaggerated superiority language

### 6. AWS and Serverless Reality Check

This section must read as credible and technically honest.

Three columns:

- Lambda wrapper approach
- Gateway approach
- CoreMCP approach

Narrative:

- wrapper approach is useful for stateless or tool-centric use
- gateway approach is useful for central exposure and managed control planes
- CoreMCP approach is for teams who need a native remote MCP server with the richer protocol model intact

Important note:

- explicitly state that Lambda is an example deployment target, not the only or default runtime

### 7. Spec Compliance by Version

Show timeline or stacked version cards for:

- `2025-11-25`
- `2025-06-18`
- `2025-03-26`
- `2024-11-05`

Key messages:

- not latest-only
- not hand-wavy about negotiation
- not frozen on one schema snapshot

Design:

- version rail with highlighted support badges
- capability markers across the timeline

### 8. Beyond `tools/list` and `tools/call`

This section should be bold and memorable.

Show the broader MCP surface:

- prompts
- resources
- resource templates
- roots
- sampling
- elicitation
- progress notifications
- tasks
- list-changed notifications
- structured tool output

Design:

- capability lattice or orbital map
- orange core at center with the broader surface branching outward

### 9. Package Atlas / Architecture

Objective:

- explain the stack shape without drowning the visitor

Show:

- `@coremcp/protocol`
- `@coremcp/core`
- `@coremcp/client`
- `@coremcp/client-http`
- `@coremcp/client-stdio`
- `@coremcp/server`
- `@coremcp/server-fastify`
- `@coremcp/server-stdio`
- `@coremcp/session-local`

Design:

- layered cards or stacked topology
- keep the package dependency graph readable on mobile

### 10. Auth, Sessions, and State

This section should frame distributed MCP as a state problem as much as a transport problem.

Messages:

- HTTP auth is part of the product story
- sessions matter for remote MCP
- external state is often required in distributed/serverless deployments
- local file-backed session storage proves the abstraction boundary in the repo

### 11. Quick-Start Code Shape

Since packages are not yet clearly public/published, this section should not use `npm install` as the main CTA.

Instead:

- show code shape and package boundaries
- use snippets demonstrating client/server package usage
- keep the note explicit that the repo is monorepo-first today

### 12. Final CTA Footer

Close with:

- architecture CTA
- deployment docs CTA
- GitHub CTA

The emotional tone should be:

- serious
- capable
- ready for infra review

## Docs IA

Primary docs pages:

- `/docs/`
- `/docs/why-coremcp`
- `/docs/distributed-mcp`
- `/docs/architecture`
- `/docs/deploy/aws-lambda-api-gateway`
- `/docs/deploy/remote-http`
- `/docs/deploy/state-and-sessions`
- `/docs/protocol/versions-and-negotiation`
- `/docs/protocol/feature-coverage`
- `/docs/transports/http-oauth`
- `/docs/transports/stdio`
- `/docs/integrations/agentcore-gateway`
- `/docs/package-reference`

Docs should be task-first, not folder-first.

Every page should open with:

- what this page helps you decide
- when to read it
- why it matters

## Visual System

### Art Direction

Shift from “package stack” to “distributed signal transport.”

Core motif mapping from the logo:

- outer navy frame = protocol envelope
- steel-blue middle frames = transport / state / network
- orange center = active execution / capability core

### Palette

- `--coremcp-primary: #1C3355`
- `--coremcp-secondary: #406F97`
- `--coremcp-accent: #FE9A22`
- warm off-white canvas
- muted slate neutrals for text hierarchy
- accessible dark mode with the same hierarchy

### Typography

- Display: Space Grotesk
- Body: Instrument Sans
- Mono: IBM Plex Mono fallback stack

### Layout

- 4px / 8px spacing grid
- generous whitespace
- strong section rhythm
- max-width controlled content columns
- obvious hierarchy in under 3 seconds

### Motion

- fade and translate for section reveal
- tiny scale/rotation corrections on cards
- reduced-motion support required
- no decorative animation that causes layout shift

### Avoid

- fake analytics dashboards
- cloud clichés
- AWS blue overload
- generic OSS template aesthetics
- language that implies CoreMCP is AWS-only

## Component List

Homepage components:

- hero signal visual
- proof cards
- pain-point cards
- differentiator grid
- deployment comparison cards
- version timeline
- capability lattice
- package atlas
- auth/session story card
- code panel
- footer CTA cluster

Docs helpers:

- decision note callout
- architecture callout
- compatibility warning callout
- “good fit / bad fit” comparison block

## Content Guardrails

- prefer “distributed-ready” over “serverless-first”
- prefer “remote MCP” over “cloud MCP”
- never imply Lambda is ideal for every capability mix
- never reduce MCP to only tool calls
- mention concrete source dates when discussing evolving AWS support

## Validation Checklist

Before implementation is considered done:

- `DESIGN.md` exists and matches the distributed-first direction
- homepage above-the-fold clearly communicates distributed MCP readiness
- version support is visually explicit
- docs clearly distinguish:
  - native remote MCP
  - Lambda-wrapped stdio MCP
  - gateway-managed MCP
- no stale CLI or package-publishing claims
- mobile layout preserves clarity
- focus states, contrast, and reduced motion are implemented
