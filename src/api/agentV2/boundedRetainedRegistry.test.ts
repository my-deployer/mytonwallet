import { BoundedRetainedRegistry } from './boundedRetainedRegistry';

describe('BoundedRetainedRegistry', () => {
  it('enforces a combined LRU quota across namespaces', () => {
    const registry = new BoundedRetainedRegistry(2, 1000, () => 0);
    registry.set('first', 'a', 1);
    registry.set('second', 'b', 2);
    expect(registry.get('first', 'a')).toBe(1);

    registry.set('second', 'c', 3);

    expect(registry.get('second', 'b')).toBeUndefined();
    expect(registry.get('first', 'a')).toBe(1);
    expect(registry.get('second', 'c')).toBe(3);
  });

  it('uses the earlier domain expiry and reports evictions', () => {
    let now = 0;
    const evicted: string[] = [];
    const registry = new BoundedRetainedRegistry(2, 1000, () => now, (entry, reason) => {
      evicted.push(`${entry.key}:${reason}`);
    });
    registry.set('draft', 'early', 1, { expiresAt: 50 });
    registry.set('draft', 'ttl', 2, { expiresAt: 5000 });

    now = 51;
    expect(registry.get('draft', 'early')).toBeUndefined();
    expect(registry.get('draft', 'ttl')).toBe(2);
    expect(evicted).toEqual(['early:expired']);
  });

  it('invalidates tokens when entries are replaced or cleared by thread', () => {
    const registry = new BoundedRetainedRegistry(3, 1000, () => 0);
    const first = registry.set('draft', 'a', 1, { threadId: 'thread-1' });
    const second = registry.set('draft', 'a', 2, { threadId: 'thread-1' });
    registry.set('draft', 'b', 3, { threadId: 'thread-2' });

    expect(registry.isCurrent('draft', 'a', first)).toBe(false);
    expect(registry.isCurrent('draft', 'a', second)).toBe(true);

    registry.deleteWhere(({ threadId }) => threadId === 'thread-1');

    expect(registry.isCurrent('draft', 'a', second)).toBe(false);
    expect(registry.get('draft', 'b')).toBe(3);
  });

  it('evicts an existing record when an expired replacement is rejected', () => {
    const evicted: string[] = [];
    const registry = new BoundedRetainedRegistry(2, 1000, () => 100, (entry, reason) => {
      evicted.push(`${entry.key}:${reason}`);
    });
    registry.set('draft', 'a', 'live');

    const expiredToken = registry.set('draft', 'a', 'expired', { expiresAt: 100 });

    expect(registry.get('draft', 'a')).toBeUndefined();
    expect(registry.isCurrent('draft', 'a', expiredToken)).toBe(false);
    expect(evicted).toEqual(['a:delete']);
  });

  it('discards in-memory entries without evicting external state', () => {
    const onEvict = jest.fn();
    const registry = new BoundedRetainedRegistry(2, 1000, () => 0, onEvict);
    registry.set('draft', 'a', 1);

    registry.discard();

    expect(registry.size).toBe(0);
    expect(onEvict).not.toHaveBeenCalled();
  });
});
