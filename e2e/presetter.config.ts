import { preset } from 'presetter';

import monorepo from '../presetter.config';

import { name } from './package.json';

export default preset(name, {
  extends: [monorepo],
});
