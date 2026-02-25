import { globalIgnores } from 'eslint/config';
import { asset, preset } from 'presetter';

import monorepo from '../../presetter.config';

import { name } from './package.json';

import type { Linter } from 'eslint';

export default preset(name, {
  extends: [monorepo],
  assets: {
    'eslint.config.ts': asset<{ default: Linter.Config[] }>(
      (current, { variables }) => ({
        ...current,
        default: [
          ...(current?.default ?? []),
          globalIgnores([`${variables.source}/schemas/*/**`]),
        ],
      }),
    ),
  },
});
