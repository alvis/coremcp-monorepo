
import { preset } from 'presetter';
import monorepo from 'presetter-preset-monorepo';

import { name } from './package.json';

export default preset(name, {
  extends: [monorepo],
});
