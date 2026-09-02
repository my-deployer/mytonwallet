export type RetainedEntryEvictionReason = 'expired' | 'quota' | 'delete' | 'clear';

export interface RetainedEntry<T = unknown> {
  expiresAt: number;
  key: string;
  namespace: string;
  threadId?: string;
  token: number;
  value: T;
}

interface RetainedEntryOptions {
  expiresAt?: number;
  threadId?: string;
}

export class BoundedRetainedRegistry {
  private readonly entriesByKey = new Map<string, RetainedEntry>();
  private nextToken = 1;

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
    private readonly onEvict?: (entry: RetainedEntry, reason: RetainedEntryEvictionReason) => void,
  ) {}

  get size() {
    this.pruneExpired();
    return this.entriesByKey.size;
  }

  get<T>(namespace: string, key: string): T | undefined {
    const registryKey = makeRegistryKey(namespace, key);
    const entry = this.entriesByKey.get(registryKey);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.remove(registryKey, 'expired');
      return undefined;
    }
    this.entriesByKey.delete(registryKey);
    this.entriesByKey.set(registryKey, entry);
    return entry.value as T;
  }

  set<T>(namespace: string, key: string, value: T, options: RetainedEntryOptions = {}) {
    const currentTime = this.now();
    const registryKey = makeRegistryKey(namespace, key);
    const expiresAt = Math.min(options.expiresAt ?? Number.POSITIVE_INFINITY, currentTime + this.ttlMs);
    const entry: RetainedEntry<T> = {
      expiresAt,
      key,
      namespace,
      token: this.nextToken,
      value,
      ...(options.threadId ? { threadId: options.threadId } : {}),
    };
    this.nextToken += 1;
    if (expiresAt <= currentTime) {
      this.remove(registryKey, 'delete');
      return entry.token;
    }
    this.entriesByKey.delete(registryKey);
    this.entriesByKey.set(registryKey, entry);
    this.pruneExpired(currentTime);
    while (this.entriesByKey.size > this.maxEntries) {
      const oldestKey = this.entriesByKey.keys().next().value;
      if (oldestKey === undefined) break;
      this.remove(oldestKey, 'quota');
    }
    return entry.token;
  }

  isCurrent(namespace: string, key: string, token: number) {
    this.pruneExpired();
    return this.entriesByKey.get(makeRegistryKey(namespace, key))?.token === token;
  }

  delete(namespace: string, key: string) {
    return this.remove(makeRegistryKey(namespace, key), 'delete');
  }

  deleteWhere(predicate: (entry: RetainedEntry) => boolean) {
    [...this.entriesByKey.entries()].forEach(([registryKey, entry]) => {
      if (predicate(entry)) this.remove(registryKey, 'delete');
    });
  }

  clear() {
    [...this.entriesByKey.keys()].forEach((registryKey) => this.remove(registryKey, 'clear'));
  }

  discard() {
    this.entriesByKey.clear();
  }

  private pruneExpired(currentTime = this.now()) {
    [...this.entriesByKey.entries()].forEach(([registryKey, entry]) => {
      if (entry.expiresAt <= currentTime) this.remove(registryKey, 'expired');
    });
  }

  private remove(registryKey: string, reason: RetainedEntryEvictionReason) {
    const entry = this.entriesByKey.get(registryKey);
    if (!entry) return false;
    this.entriesByKey.delete(registryKey);
    this.onEvict?.(entry, reason);
    return true;
  }
}

function makeRegistryKey(namespace: string, key: string) {
  return `${namespace}\0${key}`;
}
