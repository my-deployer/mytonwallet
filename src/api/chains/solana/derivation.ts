import { getAddressDecoder } from '@solana/kit';

import type { ApiDerivation, ApiSolanaWallet } from '../../types';

import { bytesToHex } from '../../common/utils';
import { SOLANA_DERIVATION_VERSION } from './derivationConstants';

export { SOLANA_DERIVATION_SPEC, SOLANA_DERIVATION_VERSION } from './derivationConstants';

/**
 * Computes a Solana address from a raw ed25519 public key.
 * Pure: no side effects, no secret material involved.
 */
export function getAddressFromPublicKey(publicKey: Uint8Array): string {
  return getAddressDecoder().decode(publicKey);
}

/**
 * Builds a public Solana wallet entry from a raw ed25519 public key and its derivation meta.
 * Pure: no side effects, no secret material involved.
 *
 * Used by both:
 * - the new-user import flow (after chain SDK derives publicKey from mnemonic), and
 * - the chain-upgrade executor (after the Enclave returns publicKey for a stored account),
 * so the two paths produce identical wallet entries.
 *
 * Stamps the wallet with the current `SOLANA_DERIVATION_VERSION` so it will not be re-targeted
 * by the chain-upgrade detector until the version is bumped.
 */
export function buildWalletFromPublicKey(
  publicKey: Uint8Array,
  derivation: ApiDerivation,
): ApiSolanaWallet {
  return {
    address: getAddressFromPublicKey(publicKey),
    publicKey: bytesToHex(publicKey),
    index: 0,
    derivation,
    derivationVersion: SOLANA_DERIVATION_VERSION,
  };
}
