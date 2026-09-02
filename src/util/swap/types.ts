/**
 * Lives here rather than in `global/types` because it is an enum, i.e. a runtime value: importing it from
 * the global types would pull that whole module — and the UI layer it describes — into the API bundle.
 */
export enum SwapType {
  /** The swap is on-chain, i.e. performed via a DEX */
  OnChain,
  /** The swap is crosschain (CEX) and happens within a single account */
  CrosschainInsideWallet,
  /** The swap is crosschain (CEX), the "in" token is sent from the app, and the "out" token is sent outside */
  CrosschainFromWallet,
  /**
   * The swap is crosschain (CEX), the "in" token is sent manually by the user from another source, and the
   * "out" token is sent to the user account.
   */
  CrosschainToWallet,
}
