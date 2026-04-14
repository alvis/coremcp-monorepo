import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faBookAtlas,
  faBookOpen,
  faBookSparkles,
  faCode,
  faDiagramProject,
  faGrid2,
  faServer,
} from '@fortawesome/pro-duotone-svg-icons';

import type { ReactNode } from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

import styles from './index.module.css';

const heroMetrics = [
  { label: 'Protocol generations', value: '4', detail: 'Negotiation-ready support across live compatibility windows.' },
  { label: 'End-to-end specs', value: '66', detail: 'Remote behavior is verified at the protocol layer.' },
  { label: 'Runtime paths', value: 'HTTP + stdio', detail: 'Transport boundaries stay visible from docs to deployment.' },
];

const heroSignals = [
  { label: 'Remote HTTP-native', icon: faServer },
  { label: 'Session-aware', icon: faDiagramProject },
  { label: 'Protocol-complete', icon: faBookSparkles },
];

const editorialHighlights = [
  {
    title: 'Transport stays legible',
    body: 'HTTP transport, auth, reconnects, and lifecycle tradeoffs stay visible instead of disappearing behind a wrapper.',
  },
  {
    title: 'State is treated as product reality',
    body: 'Sessions, resumability, progress, and tasks are treated as first-class distributed behavior.',
  },
  {
    title: 'Version drift is handled on purpose',
    body: 'Compatibility stays explicit across multiple protocol generations instead of collapsing into latest-only optimism.',
  },
];

const capabilitySignals = [
  {
    icon: faServer,
    eyebrow: 'Remote stack',
    title: 'Ship native remote MCP, not an afterthought proxy.',
    body: 'CoreMCP is organized around the protocol shape you actually deploy: remote HTTP, stdio, sessions, and persistence.',
  },
  {
    icon: faBookOpen,
    eyebrow: 'Broader surface',
    title: 'Keep the rest of MCP intact.',
    body: 'Prompts, resources, roots, sampling, elicitation, progress, and tasks stay intact instead of getting erased.',
  },
];

const packageGroups = [
  {
    icon: faBookAtlas,
    title: 'Protocol and validation',
    body: 'Types, schemas, and compatibility logic for the wire contract.',
    packages: ['@coremcp/protocol'],
  },
  {
    icon: faGrid2,
    title: 'Core and persistence',
    body: 'Session lifecycle and local state tools for distributed workflows.',
    packages: ['@coremcp/core', '@coremcp/session-local'],
  },
  {
    icon: faCode,
    title: 'Transport-specific clients',
    body: 'Connector, remote HTTP, and stdio clients separated on purpose.',
    packages: ['@coremcp/client', '@coremcp/client-http', '@coremcp/client-stdio'],
  },
  {
    icon: faServer,
    title: 'Native server surfaces',
    body: 'Server packages matched to the transport you intend to operate.',
    packages: ['@coremcp/server', '@coremcp/server-fastify', '@coremcp/server-stdio'],
  },
];

const actionCards = [
  {
    step: '01',
    icon: faBookOpen,
    title: 'Read the docs hub',
    body: 'Start with the docs overview before diving into deployment details.',
    href: '/docs',
    cta: 'Open docs',
  },
  {
    step: '02',
    icon: faServer,
    title: 'Choose the runtime path',
    body: 'Use the Lambda and remote HTTP guides to decide whether your runtime matches the protocol behavior you need.',
    href: '/docs/deploy/aws-lambda-api-gateway',
    cta: 'See deployment guides',
  },
  {
    step: '03',
    icon: faDiagramProject,
    title: 'Verify capability breadth',
    body: 'Check feature coverage before committing to an architecture that silently shrinks MCP down to tools only.',
    href: '/docs/protocol/feature-coverage',
    cta: 'Review feature coverage',
  },
];

const codeSample = `import { McpServer } from '@coremcp/server';
import { HTTPTransport } from '@coremcp/server-fastify';

const server = new McpServer({
  serverInfo: { name: 'RemoteTools', version: '1.0.0' },
  handlers: {
    handleCallTool: async (_params, session) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: true, session: session.id }),
        },
      ],
    }),
  },
});

await new HTTPTransport({
  mcpServer: server,
  port: 8080,
}).start();`;

function IconText({
  icon,
  children,
  className,
}: {
  icon: IconDefinition;
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <span className={clsx(styles.iconText, className)}>
      <FontAwesomeIcon icon={icon} className={styles.inlineIcon} />
      <span>{children}</span>
    </span>
  );
}

function HeroArtwork(): ReactNode {
  return (
    <div className={styles.heroArtwork} aria-hidden="true">
      <div className={styles.heroImageWrap}>
        <img
          alt="Abstract topology field showing a distributed remote MCP network."
          className={styles.heroImage}
          src="/img/brand/hero-topology-field.webp"
        />
        <div className={styles.heroImageGlow} />
      </div>

      <div className={styles.signalCard}>
        <div>
          <p className={styles.cardEyebrow}>Signal map</p>
          <Heading as="h2" className={styles.signalTitle}>
            Remote topology, protocol breadth, and sessions stay in frame.
          </Heading>
        </div>
        <div className={styles.signalFlow}>
          <span><IconText icon={faGrid2}>Client</IconText></span>
          <span><IconText icon={faBookAtlas}>Protocol</IconText></span>
          <span><IconText icon={faServer}>Runtime</IconText></span>
          <span><IconText icon={faDiagramProject}>Session</IconText></span>
        </div>
      </div>
    </div>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Full-spec MCP for distributed runtimes"
      description="CoreMCP is a distributed-ready TypeScript MCP stack for remote HTTP deployments, full protocol coverage, session handling, and multi-version support."
    >
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={clsx('container', styles.heroContainer)}>
            <div className={styles.heroStage}>
              <div className={styles.heroCopy}>
                <p className={styles.eyebrow}>Bold infrastructure for real remote MCP</p>
                <Heading as="h1" className={styles.heroTitle}>
                  Full-spec MCP for teams shipping beyond localhost.
                </Heading>
                <p className={styles.heroLead}>
                  CoreMCP keeps transport, auth, sessions, version negotiation,
                  and the wider protocol surface explicit, so remote MCP still
                  reads like a system instead of a wrapper demo.
                </p>
                <div className={styles.heroSignalRow} role="list" aria-label="CoreMCP strengths">
                  {heroSignals.map((signal) => (
                    <span key={signal.label} className={styles.heroSignal} role="listitem">
                      <IconText icon={signal.icon}>{signal.label}</IconText>
                    </span>
                  ))}
                </div>
                <div className={styles.heroActions}>
                  <Link
                    className={clsx('button button--lg', styles.primaryButton)}
                    to="/docs"
                  >
                    Read the docs
                  </Link>
                  <Link
                    className={clsx('button button--lg', styles.secondaryButton)}
                    to="/docs/deploy/aws-lambda-api-gateway"
                  >
                    See deployment guides
                  </Link>
                </div>
              </div>

              <HeroArtwork />
            </div>
          </div>
        </section>

        <section className={styles.metricSection}>
          <div className="container">
            <div className={styles.metricRail}>
              {heroMetrics.map((metric) => (
                <article key={metric.label} className={styles.metricCard}>
                  <p className={styles.metricLabel}>{metric.label}</p>
                  <p className={styles.metricValue}>{metric.value}</p>
                  <p className={styles.metricDetail}>{metric.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.editorialSection}>
          <div className="container">
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>Why it feels different</p>
              <Heading as="h2" className={styles.sectionTitle}>
                CoreMCP is biased toward real distributed systems, not prettier toy demos.
              </Heading>
              <p className={styles.sectionLead}>
                The site should communicate infrastructure confidence quickly:
                explicit transport boundaries, broader protocol coverage, and a
                stack that still reads clearly once deployment gets real.
              </p>
            </div>

            <div className={styles.editorialGrid}>
              {editorialHighlights.map((highlight) => (
                <article key={highlight.title} className={styles.editorialCard}>
                  <Heading as="h3" className={styles.cardTitle}>
                    {highlight.title}
                  </Heading>
                  <p>{highlight.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.darkBand}>
          <div className="container">
            <div className={styles.bandGrid}>
              <div className={styles.bandCopy}>
                <p className={styles.sectionEyebrow}>Operating posture</p>
                <Heading as="h2" className={styles.bandTitle}>
                  The protocol surface, runtime behavior, and deployment choice should agree with each other.
                </Heading>
              </div>

              <div className={styles.capabilityGrid}>
                {capabilitySignals.map((item) => (
                  <article key={item.title} className={styles.capabilityCard}>
                    <p className={styles.cardEyebrow}>
                      <IconText icon={item.icon}>{item.eyebrow}</IconText>
                    </p>
                    <Heading as="h3" className={styles.capabilityTitle}>
                      {item.title}
                    </Heading>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.packageSection}>
          <div className="container">
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>Package atlas</p>
              <Heading as="h2" className={styles.sectionTitle}>
                Compose the stack you need without hiding where the boundaries actually are.
              </Heading>
              <p className={styles.sectionLead}>
                Pick the protocol, core, client, and server layers separately
                so deployment and runtime choices stay legible instead of being
                collapsed into a single black box.
              </p>
            </div>

            <div className={styles.packageGrid}>
              {packageGroups.map((group) => (
                <article key={group.title} className={styles.packageCard}>
                  <p className={styles.cardEyebrow}>
                    <IconText icon={group.icon}>Package lane</IconText>
                  </p>
                  <Heading as="h3" className={styles.cardTitle}>
                    {group.title}
                  </Heading>
                  <p className={styles.packageBody}>{group.body}</p>
                  <div className={styles.packageList}>
                    {group.packages.map((pkg) => (
                      <code key={pkg} className={styles.packageName}>
                        {pkg}
                      </code>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.codeSection}>
          <div className="container">
            <div className={styles.codeShell}>
              <div className={styles.codeMeta}>
                <p className={styles.sectionEyebrow}>Code posture</p>
                <Heading as="h2" className={styles.sectionTitle}>
                  Native remote MCP stays readable in code.
                </Heading>
                <p className={styles.codeText}>
                  Use the server and transport packages directly when you want a
                  deliberate HTTP implementation rather than a wrapper that
                  hides protocol decisions.
                </p>

                <div className={styles.actionGrid}>
                  {actionCards.map((card) => (
                    <article key={card.step} className={styles.actionCard}>
                      <p className={styles.actionStep}>
                        <IconText icon={card.icon}>{card.step}</IconText>
                      </p>
                      <Heading as="h3" className={styles.actionTitle}>
                        {card.title}
                      </Heading>
                      <p>{card.body}</p>
                      <Link className={styles.inlineLink} to={card.href}>
                        <IconText icon={faArrowRight}>{card.cta}</IconText>
                      </Link>
                    </article>
                  ))}
                </div>
              </div>

              <pre className={styles.codeBlock}>
                <code>{codeSample}</code>
              </pre>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
