import type {
  AgentToolCall,
  AgentToolResultRequestV2,
  AgentWalletDataTransactionRowV3,
  AgentWalletFilterClauseV1,
} from './protocol/types';

import { textContainsTransactionHash } from './walletQueryTransactionHash';

export type WalletQueryPreflightFailure =
  | { reason: 'duplicate_transaction_row_id'; rowId: string }
  | { reason: 'invalid_transaction_quantity'; rowId: string }
  | { reason: 'non_monotonic_transaction_order' }
  | { reason: 'transaction_timestamp_out_of_bounds'; rowId: string }
  | { reason: 'transaction_detail_hash_leaked' };

interface TimestampBounds {
  from?: string;
  to?: string;
}

export function getWalletQueryPreflightFailure(
  call: AgentToolCall,
  request: AgentToolResultRequestV2,
): WalletQueryPreflightFailure | undefined {
  if (call.name !== 'wallet.data.query' || request.status !== 'success' || request.toolName !== 'wallet.data.query') {
    return undefined;
  }
  const args = call.arguments;
  const result = request.result.result;
  if (args.operation === 'transactions.detail') {
    if (result.operation !== args.operation || result.status !== 'resolved') return undefined;
    return containsTransactionHash(result, args.hash)
      ? { reason: 'transaction_detail_hash_leaked' }
      : undefined;
  }
  if (args.operation !== 'transactions.list' || result.operation !== args.operation || result.status !== 'resolved') {
    return undefined;
  }
  return inspectTransactions(result.transactions, getTimestampBounds(args.filters.clauses));
}

function containsTransactionHash(value: unknown, hash: string): boolean {
  if (typeof value === 'string') return textContainsTransactionHash(value, hash);
  if (Array.isArray(value)) return value.some((item) => containsTransactionHash(item, hash));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some((item) => containsTransactionHash(item, hash));
}

function inspectTransactions(
  transactions: AgentWalletDataTransactionRowV3[],
  bounds: TimestampBounds,
): WalletQueryPreflightFailure | undefined {
  const rowIds = new Set<string>();
  let previousTimestamp = Number.POSITIVE_INFINITY;
  for (const transaction of transactions) {
    if (rowIds.has(transaction.rowId)) {
      return { reason: 'duplicate_transaction_row_id', rowId: transaction.rowId };
    }
    rowIds.add(transaction.rowId);
    if (transaction.quantity !== undefined && isZeroQuantity(transaction.quantity)) {
      return { reason: 'invalid_transaction_quantity', rowId: transaction.rowId };
    }
    if (isTimestampOutOfBounds(transaction.timestamp, bounds)) {
      return { reason: 'transaction_timestamp_out_of_bounds', rowId: transaction.rowId };
    }
    const timestamp = Date.parse(transaction.timestamp);
    if (timestamp > previousTimestamp) return { reason: 'non_monotonic_transaction_order' };
    previousTimestamp = timestamp;
  }
  return undefined;
}

function getTimestampBounds(clauses: AgentWalletFilterClauseV1[]): TimestampBounds {
  const timestampFilter = clauses.find((clause) => clause.field === 'transaction.timestamp');
  return timestampFilter?.field === 'transaction.timestamp'
    ? { from: timestampFilter.range.fromInclusive, to: timestampFilter.range.toExclusive }
    : {};
}

function isTimestampOutOfBounds(timestamp: string, bounds: TimestampBounds) {
  const value = Date.parse(timestamp);
  const from = bounds.from ? Date.parse(bounds.from) : Number.NEGATIVE_INFINITY;
  const to = bounds.to ? Date.parse(bounds.to) : Number.POSITIVE_INFINITY;
  return !Number.isFinite(value) || value < from || value >= to;
}

function isZeroQuantity(quantity: string) {
  return /^-?0(?:\.0+)?$/u.test(quantity);
}
