import type { ApiTokenWithPrice } from '../types';
import type { Repository } from './types';

import { createNoopRepository } from './noopRepository';

export type { ApiDbNft, ApiDbSseConnection } from './types';

/**
 * Air keeps its state in native storage and never reads this cache back, so the Dexie implementation is
 * reached through a guarded `require`: with `IS_AIR_APP` folded to a literal, dead-code elimination drops
 * the module and the `dexie` dependency from the bundle.
 */
export const tokenRepository: Repository<ApiTokenWithPrice> = process.env.IS_AIR_APP === '1'
  ? createNoopRepository<ApiTokenWithPrice>()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  : require('./dexie').tokenRepository;
