import type * as agentV2Methods from './agentV2';
import type * as extraMethods from './extra';
import type * as methods from './index';

/**
 * Every half of the dispatch table. The extra methods are absent from a `NO_EXTRA_FEATURES` build at
 * runtime, but the type stays complete so callers keep type-checking against the full API.
 */
export type Methods = typeof methods & typeof extraMethods & typeof agentV2Methods;
export type MethodArgs<N extends keyof Methods> = Parameters<Methods[N]>;
export type MethodResponse<N extends keyof Methods> = ReturnType<Methods[N]>;
