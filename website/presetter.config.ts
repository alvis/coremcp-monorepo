import { preset } from 'presetter';

import packageJson from './package.json';
import monorepo from '../presetter.config';

export default preset(packageJson.name, {
  extends: [monorepo],
  assets: {
    '.gitignore': ['/.docusaurus', '/build'],
    'tsconfig.build.json': null,
    'tsconfig.json': () => ({
      extends: '@docusaurus/tsconfig',
      compilerOptions: {
        baseUrl: '.',
      },
      include: [
        'src/**/*.ts',
        'src/**/*.tsx',
        'docs/**/*.md',
        'docs/**/*.mdx',
        'docusaurus.config.ts',
        'sidebars.ts',
      ],
    }),
  },
});
