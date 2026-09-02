import type { AgenticWalletToolErrorCode } from './protocol/types';

import { ApiServerError } from '../errors';

export class WalletQueryProjectionError extends Error {
  constructor(
    readonly code: AgenticWalletToolErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export function isWalletSourceError(error: unknown) {
  return error instanceof ApiServerError || isRetryableWalletSourceError(error);
}

export function isRetryableWalletSourceError(error: unknown) {
  if (error instanceof ApiServerError) {
    return error.statusCode === undefined
      || error.statusCode === 408
      || error.statusCode === 429
      || error.statusCode >= 500;
  }
  if (error instanceof DOMException) {
    return error.name === 'NetworkError' || error.name === 'TimeoutError';
  }
  if (error instanceof TypeError) {
    return /failed to fetch|fetch failed|load failed|networkerror|offline/iu.test(error.message);
  }
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? error.code : undefined;
  return code === 'NETWORK_ERROR' || code === 'TIMEOUT' || code === 'SERVER_ERROR';
}
