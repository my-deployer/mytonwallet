import type { Methods } from './types';

import * as commonMethods from '.';

/**
 * The dispatch table every provider indexes by method name.
 *
 * The halves arrive through `require` rather than a static import, because the connector dispatches with
 * `methods[fnName]`, and a dynamic lookup on a namespace pins every export in it: nothing re-exported from
 * `methods/index` can be tree-shaken.
 */
export const methods = { ...commonMethods } as Methods;

// `process.env` is read inline rather than through `config`, because Webpack substitutes it before
// dead-code elimination: that leaves the `require`s in a statically false branch and drops `./extra`,
// `./agentV2` and everything they pull. Read through `config`, the branch survives and nothing is
// eliminated.
if (process.env.NO_EXTRA_FEATURES !== '1') {
  /* eslint-disable @typescript-eslint/no-require-imports */
  Object.assign(methods, require('./extra') as typeof import('./extra'));
  Object.assign(methods, require('./agentV2') as typeof import('./agentV2'));
  /* eslint-enable @typescript-eslint/no-require-imports */
}
