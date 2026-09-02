import type { Repository } from './types';

/**
 * Stands in for the Dexie repository where IndexedDB is not the storage of record. Reads answer empty and
 * writes are discarded, which is what the Dexie repository already did on Air.
 */
export function createNoopRepository<T>(): Repository<T> {
  return {
    all: () => Promise.resolve([]),
    find: () => Promise.resolve(undefined),
    put: () => Promise.resolve(undefined),
    bulkPut: () => Promise.resolve(undefined),
    update: () => Promise.resolve(undefined),
    delete: () => Promise.resolve(undefined),
    deleteWhere: () => Promise.resolve(undefined),
    clear: () => Promise.resolve(undefined),
  };
}
