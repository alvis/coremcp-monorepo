import path from 'node:path';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'CoreMCP',
  tagline: 'Full-spec MCP for distributed runtimes',
  favicon: 'img/coremcp-logo.svg',
  future: {
    v4: {
      removeLegacyPostBuildHeadAttribute: true,
      useCssCascadeLayers: true,
      siteStorageNamespacing: true,
      fasterByDefault: false,
      mdx1CompatDisabledByDefault: true,
    },
  },
  url: 'https://alvis.github.io',
  baseUrl: '/',
  organizationName: 'alvis',
  projectName: 'coremcp-monorepo',
  onBrokenLinks: 'throw',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  themes: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        docsRouteBasePath: '/docs',
        hashed: true,
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
      },
    ],
  ],
  plugins: [
    function searchInputA11yPlugin() {
      return {
        name: 'search-input-a11y',
        getClientModules() {
          return [
            path.resolve(__dirname, 'src/clientModules/fontawesome.js'),
            path.resolve(__dirname, 'src/clientModules/navbarChrome.jsx'),
            path.resolve(__dirname, 'src/clientModules/searchInputA11y.js'),
          ];
        },
      };
    },
  ],
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/docs',
          sidebarPath: './sidebars.ts',
          showLastUpdateAuthor: false,
          showLastUpdateTime: false,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          changefreq: 'weekly',
          priority: 0.6,
        },
      } satisfies Preset.Options,
    ],
  ],
  stylesheets: [
    'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap',
  ],
  themeConfig: {
    image: 'img/brand/coremcp-og.webp',
    metadata: [
      {
        name: 'description',
        content:
          'CoreMCP is a distributed-ready, full-spec TypeScript MCP stack for remote HTTP deployment, auth, sessions, and multi-version protocol support.',
      },
      {
        name: 'keywords',
        content:
          'MCP, Model Context Protocol, TypeScript, distributed MCP, remote MCP, streamable HTTP, OAuth, sessions, AWS Lambda',
      },
      {
        property: 'og:image',
        content: 'https://alvis.github.io/img/brand/coremcp-og.webp',
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
    ],
    navbar: {
      title: 'CoreMCP',
      logo: {
        alt: 'CoreMCP Logo',
        src: 'img/coremcp-logo.svg',
      },
      hideOnScroll: false,
      items: [
        {
          to: '/docs',
          label: 'Docs',
          position: 'left',
          activeBaseRegex: '^/docs(?:/.*)?$',
        },
        {
          type: 'search',
          position: 'right',
        },
        {
          href: 'https://github.com/alvis/coremcp-monorepo',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Why CoreMCP', to: '/docs/why-coremcp' },
            { label: 'Distributed MCP', to: '/docs/distributed-mcp' },
            { label: 'Architecture', to: '/docs/architecture' },
          ],
        },
        {
          title: 'Deploy',
          items: [
            {
              label: 'Remote HTTP',
              to: '/docs/deploy/remote-http',
            },
            {
              label: 'AWS Lambda + API Gateway',
              to: '/docs/deploy/aws-lambda-api-gateway',
            },
            {
              label: 'State and Sessions',
              to: '/docs/deploy/state-and-sessions',
            },
          ],
        },
        {
          title: 'Protocol',
          items: [
            {
              label: 'Versions and Negotiation',
              to: '/docs/protocol/versions-and-negotiation',
            },
            {
              label: 'Feature Coverage',
              to: '/docs/protocol/feature-coverage',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'AgentCore Gateway',
              to: '/docs/integrations/agentcore-gateway',
            },
            {
              label: 'Package Reference',
              to: '/docs/package-reference',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/alvis/coremcp-monorepo',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Alvis HT Tang. Built with Docusaurus.`,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
