import type { ApiNft } from '../types';
import type { DbRepository } from './repository';

export type ApiDbNft = ApiNft & {
  accountId: string;
  collectionAddress: string;
};

export type ApiDbSseConnection = {
  clientId: string;
};

/**
 * The persistence surface shared by the Dexie-backed and the no-op repositories. Derived from
 * `DbRepository` so the two cannot drift apart; `table` is excluded because it is Dexie-specific.
 */
export type Repository<T> = Omit<DbRepository<T>, 'table'>;
