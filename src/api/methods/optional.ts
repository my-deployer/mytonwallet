/**
 * Accessors for the optional half of the API, used by the code that stays in a `NO_EXTRA_FEATURES` build
 * but can still reach into it.
 *
 * `process.env` is read inline rather than through `config`, because Webpack substitutes it before
 * dead-code elimination: that leaves each `require` in a statically false branch, so the module and its
 * dependencies drop out of the bundle. Every caller sits behind a condition that is unreachable in such a
 * build, and the throw makes it obvious if one ever is not.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

export function requireMfaMethods() {
  if (process.env.NO_EXTRA_FEATURES !== '1') {
    return require('./mfa') as typeof import('./mfa');
  }

  throw new Error('MFA is not supported in this build');
}

export function requireSwapMethods() {
  if (process.env.NO_EXTRA_FEATURES !== '1') {
    return require('./swap') as typeof import('./swap');
  }

  throw new Error('Swap is not supported in this build');
}

export function requireStakingMethods() {
  if (process.env.NO_EXTRA_FEATURES !== '1') {
    return require('./staking') as typeof import('./staking');
  }

  throw new Error('Staking is not supported in this build');
}

export function requireAgentV2Lifecycle() {
  if (process.env.NO_EXTRA_FEATURES !== '1') {
    return require('./agentV2Lifecycle') as typeof import('./agentV2Lifecycle');
  }

  throw new Error('Agent V2 is not supported in this build');
}
