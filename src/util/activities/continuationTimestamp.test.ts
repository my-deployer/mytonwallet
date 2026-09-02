import type { ApiActivity, ApiTransactionActivity } from '../../api/types';

import { getActivityContinuationTimestamp } from './index';

function makeActivity(
  id: string,
  timestamp: number,
  status: ApiTransactionActivity['status'] = 'completed',
): ApiTransactionActivity {
  return {
    id,
    kind: 'transaction',
    amount: 1n,
    fee: 0n,
    fromAddress: 'from',
    toAddress: 'to',
    normalizedAddress: 'to',
    slug: 'eth',
    isIncoming: true,
    status,
    timestamp,
  };
}

describe('getActivityContinuationTimestamp', () => {
  it('takes the oldest activity that can serve as a cursor', () => {
    const activities: ApiActivity[] = [
      makeActivity('a', 300),
      makeActivity('b', 200),
      makeActivity('c:backend-swap', 100),
    ];

    expect(getActivityContinuationTimestamp(activities, (activity) => activity)).toBe(200);
  });

  it('falls back to the oldest activity when nothing can serve as a cursor', () => {
    // The whole slice is swaps merged from our backend. Preferring a cursor that does not exist
    // leaves the caller with no anchor at all, which is what makes it re-request the first page
    // forever. An approximate cursor only overlaps what is already held.
    const activities: ApiActivity[] = [
      makeActivity('a:backend-swap', 300),
      makeActivity('b:local', 200),
      makeActivity('c', 100, 'pending'),
    ];

    expect(getActivityContinuationTimestamp(activities, (activity) => activity)).toBe(100);
  });

  it('has no answer for an empty slice', () => {
    expect(getActivityContinuationTimestamp([], (activity) => activity)).toBeUndefined();
  });

  it('ignores gaps left by unknown ids', () => {
    expect(getActivityContinuationTimestamp([makeActivity('a', 300), undefined], (activity) => activity)).toBe(300);
  });
});

describe('getActivityContinuationTimestamp reading through ids', () => {
  it('answers from an id list without materializing the activities', () => {
    const byId: Record<string, ApiActivity> = {
      a: makeActivity('a', 300),
      b: makeActivity('b', 200),
      c: makeActivity('c:backend-swap', 100),
    };

    expect(getActivityContinuationTimestamp(['a', 'b', 'c'], (id) => byId[id])).toBe(200);
  });

  it('skips ids that name nothing', () => {
    const byId: Record<string, ApiActivity> = { a: makeActivity('a', 300) };

    expect(getActivityContinuationTimestamp(['a', 'missing'], (id) => byId[id])).toBe(300);
  });
});
