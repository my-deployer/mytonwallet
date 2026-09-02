import type { ApiDerivationSpec } from '../../types';

import { SOLANA_DERIVATION_PATHS } from './constants';

/**
 * Derivation metadata that non-Solana code needs (chain config, storage migrations).
 *
 * Kept apart from `derivation.ts` because that module imports `@solana/kit`: importing these constants
 * from outside the chain would otherwise put the whole Solana SDK into the module graph of builds that set
 * `NO_SOLANA`, leaving the output to depend on tree-shaking rather than on the import graph.
 */

/**
 * Target derivation spec for new Solana wallets.
 * Uses the Phantom path at index 0, which matches `pickBestWallet(isMigration: true)`
 * in auth.ts - so new-user import and chain-upgrade produce identical wallets.
 */
export const SOLANA_DERIVATION_SPEC: ApiDerivationSpec = {
  standard: 'bip39',
  curve: 'ed25519',
  path: SOLANA_DERIVATION_PATHS.phantom.replace('{index}', '0'),
};

/** Current target version for Solana derivation. Bump to trigger re-derivation of all stored wallets. */
export const SOLANA_DERIVATION_VERSION = 1;
