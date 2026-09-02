/**
 * Derivation metadata that non-TON code needs (chain config, storage migrations).
 *
 * Kept apart from `constants.ts` because that module pulls the jetton-staking contract constants: importing
 * the path from outside the chain would otherwise put them into the module graph of builds that set
 * `NO_TON`.
 */

/** TON BIP39 derivation path template (`{index}` is replaced with the account index) */
export const TON_BIP39_PATH = `m/44'/607'/{index}'`;
