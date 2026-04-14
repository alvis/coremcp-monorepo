import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'index',
    'why-coremcp',
    'distributed-mcp',
    'architecture',
    {
      type: 'category',
      label: 'Choose a deployment path',
      items: [
        'deploy/remote-http',
        'deploy/aws-lambda-api-gateway',
        'deploy/state-and-sessions',
      ],
    },
    {
      type: 'category',
      label: 'Understand the protocol',
      items: [
        'protocol/versions-and-negotiation',
        'protocol/feature-coverage',
      ],
    },
    {
      type: 'category',
      label: 'Use a transport',
      items: ['transports/http-oauth', 'transports/stdio'],
    },
    {
      type: 'category',
      label: 'Integrate with gateways',
      items: ['integrations/agentcore-gateway'],
    },
    {
      type: 'category',
      label: 'Reference',
      items: ['package-reference'],
    },
  ],
};

export default sidebars;
