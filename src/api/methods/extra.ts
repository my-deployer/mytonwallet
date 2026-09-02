/**
 * Methods a plain send/receive wallet never calls.
 *
 * Kept out of `methods/index` because the connector dispatches with `methods[fnName]`, and a dynamic
 * lookup on a namespace pins every export in it: nothing re-exported there can ever be tree-shaken. These
 * reach the dispatch table through a guarded `require` instead, so a `NO_EXTRA_FEATURES` build drops them.
 */
export * from './exploreSites';
export * from './legacyAuth';
export * from './mfa';
export * from './notifications';
export * from './portfolio';
export * from './staking';
export * from './swap';
export * from './walletConnectPay';
