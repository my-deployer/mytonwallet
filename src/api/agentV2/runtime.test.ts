import type { Storage } from '../storages/types';
import type {
  AgentSemanticContentV1,
  AgentToolCall,
  AgentToolResultRequestV2,
  AgentWalletConversationContextV5,
} from './protocol/types';
import type {
  AgentV2ActionPresentation,
  AgentV2ClientUpdate,
  AgentV2HostContextSnapshot,
  AgentV2HydratedMessage,
} from './types';
import type { AgentV2WalletContextCacheBinding } from './walletConversationContextCache';

import navigationActionFixture from '../../../tests/fixtures/agentV2/navigation-action-projection.v1.json';
import terminalStructuredOutputFixture from '../../../tests/fixtures/agentV2/terminal-structured-output-stream.v1.json';
import contractManifest from './generated/manifest.json';
import {
  AGENT_V2_CUSTOM_WRITER_INSTRUCTION_HEADER,
  encodeAgentV2CustomWriterInstructionHeader,
} from './customWriterInstruction';
import { AgentV2Runtime, type AgentV2ToolExecutionContext } from './runtime';
import { AgentV2WalletSession, createAgentV2WalletSession } from './walletSession';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_RUN_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_RUN_ID_2 = '22222222-2222-4222-8222-222222222223';
const RUN_ID = '33333333-3333-4333-8333-333333333333';
const RUN_ID_2 = '33333333-3333-4333-8333-333333333334';
const THREAD_ID = '44444444-4444-4444-8444-444444444444';
const THREAD_ID_2 = '44444444-4444-4444-8444-444444444445';
const MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const MESSAGE_ID_2 = '55555555-5555-4555-8555-555555555556';
const MESSAGE_ID_3 = '55555555-5555-4555-8555-555555555557';
const TOOL_CALL_ID = '66666666-6666-4666-8666-666666666666';
const TOOL_RESULT_ID = '77777777-7777-4777-8777-777777777777';
const WALLET_SESSION_ID = '88888888-8888-4888-8888-888888888888';
const PRIVATE_TOOL_ARGUMENT = 'PRIVATE_TOOL_ARGUMENT';
const PRIVATE_TOOL_REASON = 'PRIVATE_TOOL_REASON';
const PRIVATE_TOOL_STATUS_MESSAGE = 'PRIVATE_TOOL_STATUS_MESSAGE';

type TerminalFixtureEvent =
  | { type: 'run_start' | 'thread'; sequence: number }
  | { type: 'message_start'; sequence: number; messageId: string }
  | { type: 'text_delta'; sequence: number; messageId: string; delta: string }
  | { type: 'action'; sequence: number; messageId: string; structuredId: string }
  | { type: 'semantic_content'; sequence: number; messageId: string }
  | { type: 'message_end'; sequence: number; messageId: string; finishReason: 'complete' | 'cancelled' | 'error' }
  | { type: 'error'; sequence: number; messageId: string };

describe('AgentV2Runtime transport', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it.each([
    ['missing', undefined, false],
    ['malformed', '{malformed', false],
    ['unknown version', JSON.stringify({ version: 1, accepted: true }), false],
    ['non-accepted', JSON.stringify({ version: 2, accepted: false }), false],
    ['accepted', JSON.stringify({ version: 2, accepted: true }), true],
  ] as const)('reads %s consent strictly', async (_name, stored, expected) => {
    const storage = createMemoryStorage();
    if (stored !== undefined) await storage.setItem('agentV2Consent', stored);
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: jest.fn() as unknown as typeof fetch,
      onUpdate: jest.fn(),
      now: () => Date.parse('2026-08-10T10:00:00.000Z'),
    });

    await expect(runtime.getConsent()).resolves.toBe(expected);
    await runtime.destroy();
  });

  it('persists one consent decision for the whole Agent runtime', async () => {
    const storage = createMemoryStorage();
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: jest.fn() as unknown as typeof fetch,
      onUpdate: jest.fn(),
      now: () => Date.parse('2026-08-10T10:00:00.000Z'),
    });

    await runtime.acceptConsent();

    await expect(runtime.getConsent()).resolves.toBe(true);
    const storedConsent = JSON.stringify({
      version: 2,
      accepted: true,
      updatedAt: '2026-08-10T10:00:00.000Z',
    });
    await expect(storage.getItem('agentV2Consent')).resolves.toBe(storedConsent);
    await runtime.destroy();
    await expect(storage.getItem('agentV2Consent')).resolves.toBe(storedConsent);
  });

  it('ordinary disposal preserves persistent wallet state', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const clear = jest.fn();
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: jest.fn() as unknown as typeof fetch,
      onUpdate: jest.fn(),
      toolExecutor: {
        execute: jest.fn(),
        discard: jest.fn(),
        clear,
      },
    });
    await runtime.acceptConsent();

    await runtime.destroy();

    expect(clear).toHaveBeenCalledWith(undefined, { shouldClearPersistentState: false });
  });

  it('clears incompatible wallet protocol state once without clearing consent', async () => {
    const storage = createMemoryStorage();
    const clearWalletSensitiveProtocolState = jest.fn(() => Promise.resolve());
    await storeIdentity(storage);
    const storedIdentity = await storage.getItem('agentV2DeviceIdentity');
    sessionStorage.setItem('agentV2WalletSession', JSON.stringify({
      version: 2,
      sessionId: WALLET_SESSION_ID,
      revision: 3,
      authorityFingerprint: 'legacy-authority',
    }));
    const walletSession = await createAgentV2WalletSession();
    await storage.setItem('agentV2Consent', JSON.stringify({ version: 2, accepted: true }));
    await storage.setItem('agentV2WalletProtocolVersion', '4');
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: jest.fn() as unknown as typeof fetch,
      onUpdate: jest.fn(),
      clearWalletSensitiveProtocolState,
      walletSession,
    });

    await expect(runtime.getConsent()).resolves.toBe(true);
    await expect(runtime.getConsent()).resolves.toBe(true);

    expect(clearWalletSensitiveProtocolState).toHaveBeenCalledTimes(1);
    expect(walletSession.snapshot()).toMatchObject({ revision: 0 });
    expect(walletSession.snapshot().sessionId).not.toBe(WALLET_SESSION_ID);
    expect(sessionStorage.getItem('agentV2WalletSession')).toBeNull();
    await expect(storage.getItem('agentV2WalletProtocolVersion')).resolves.toBe('5');
    await expect(storage.getItem('agentV2Consent')).resolves.toBe(
      JSON.stringify({ version: 2, accepted: true }),
    );
    await expect(storage.getItem('agentV2DeviceIdentity')).resolves.toBe(storedIdentity);
    await runtime.destroy();
  });

  it('fails closed when incompatible wallet protocol state cannot be cleared', async () => {
    const storage = createMemoryStorage();
    const fetchMock = jest.fn() as unknown as typeof fetch;
    await storage.setItem('agentV2Consent', JSON.stringify({ version: 2, accepted: true }));
    await storage.setItem('agentV2WalletProtocolVersion', '4');
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      clearWalletSensitiveProtocolState: () => Promise.reject(new Error('upgrade blocked')),
    });

    await expect(runtime.getConsent()).rejects.toThrow('upgrade blocked');

    await expect(storage.getItem('agentV2WalletProtocolVersion')).resolves.toBe('4');
    await expect(storage.getItem('agentV2Consent')).resolves.toBe(
      JSON.stringify({ version: 2, accepted: true }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await runtime.destroy();
  });

  it('does not start a run after runtime disposal during capability loading', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    let resolveHints!: (response: Response) => void;
    let markHintsRequested!: () => void;
    const hintsRequested = new Promise<void>((resolve) => {
      markHintsRequested = resolve;
    });
    const hintsResponse = new Promise<Response>((resolve) => {
      resolveHints = resolve;
    });
    const requestedUrls: string[] = [];
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      requestedUrls.push(url);
      if (url.includes('/hints')) {
        markHintsRequested();
        return hintsResponse;
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      walletConversationContextCache: {
        clear: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        get: () => Promise.resolve(undefined),
        put: () => Promise.resolve(),
      },
    });
    await runtime.acceptConsent();

    const run = runtime.startRun({
      expectedThreadRevision: 0,
      input: { kind: 'append', text: 'Wallet balance' },
    });
    await hintsRequested;
    await runtime.destroy({ shouldClearPersistentIdentity: true });
    resolveHints(disabledHintsResponse());

    await expect(run).rejects.toThrow('Agent V2 runtime is destroyed');
    expect(requestedUrls).not.toContain('https://agent.test/api/v2/runs');
  });

  it('ignores delayed control-plane responses after disposal', async () => {
    jest.useFakeTimers();
    try {
      const storage = createMemoryStorage();
      await storeIdentity(storage);
      const updates: AgentV2ClientUpdate[] = [];
      const pendingResponses = new Map<string, (response: Response) => void>();
      const requested = new Set<string>();
      let markAllRequested!: () => void;
      const allRequested = new Promise<void>((resolve) => {
        markAllRequested = resolve;
      });
      const fetchMock = jest.fn((input: string | URL | Request) => {
        const url = getRequestUrl(input);
        const operation = new Promise<Response>((resolve) => {
          pendingResponses.set(url, resolve);
          requested.add(url);
          if (requested.size === 2) markAllRequested();
        });
        return operation;
      }) as unknown as typeof fetch;
      const runtime = new AgentV2Runtime({
        storage,
        baseUrl: 'https://agent.test/api/v2',
        fetch: fetchMock,
        onUpdate: (update) => updates.push(update),
      });
      await runtime.acceptConsent();

      const quota = runtime.getUserQuota();
      const availability = runtime.getAvailability();
      await allRequested;
      expect(requested).toEqual(new Set([
        'https://agent.test/api/v2/quota',
        'https://agent.test/api/v2/availability',
      ]));

      await runtime.destroy();
      pendingResponses.get('https://agent.test/api/v2/quota')!(jsonResponse({
        protocolVersion: 2,
        quota: {
          limit: 20,
          used: 5,
          remaining: 15,
          resetAt: '2026-08-12T00:00:00.000Z',
        },
      }));
      pendingResponses.get('https://agent.test/api/v2/availability')!(jsonResponse({
        protocolVersion: 2,
        state: 'capacity_exhausted',
        resetAt: '2026-08-12T00:00:00.000Z',
      }));
      const results = await Promise.allSettled([quota, availability]);

      expect(results).toEqual([
        { status: 'rejected', reason: new Error('Agent V2 runtime is destroyed') },
        { status: 'rejected', reason: new Error('Agent V2 runtime is destroyed') },
      ]);
      expect(updates).toEqual([]);
      expect(jest.getTimerCount()).toBe(0);
      expect(() => runtime.getConsent()).toThrow('Agent V2 runtime is destroyed');
      expect(() => runtime.resolveAction(MESSAGE_ID, 'action')).toThrow('Agent V2 runtime is destroyed');
    } finally {
      jest.useRealTimers();
    }
  });

  it('aborts an active tool and skips terminal quota refresh during disposal', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    let quotaRequests = 0;
    let executionSignal: AbortSignal | undefined;
    let markExecutionStarted!: () => void;
    const executionStarted = new Promise<void>((resolve) => {
      markExecutionStarted = resolve;
    });
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/quota')) {
        quotaRequests += 1;
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          quota: {
            limit: 20,
            used: quotaRequests,
            remaining: 20 - quotaRequests,
            resetAt: '2026-08-12T00:00:00.000Z',
          },
        }));
      }
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([
          runStart(),
          toolCallEvent(2),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      randomUuid: () => ids.shift()!,
      toolExecutor: {
        execute: jest.fn((_call, context) => {
          executionSignal = context.signal;
          markExecutionStarted();
          return new Promise(() => undefined);
        }),
        discard: jest.fn(),
      },
    });
    await runtime.acceptConsent();
    await runtime.getUserQuota();

    const run = runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Search for TON' },
    });
    await executionStarted;
    await runtime.destroy();

    await expect(run).resolves.toMatchObject({ state: 'interrupted' });
    expect(executionSignal?.aborted).toBe(true);
    expect(quotaRequests).toBe(2);
  });

  it('negotiates capacity support and rechecks availability when a known reset is reached', async () => {
    jest.useFakeTimers();
    let now = Date.parse('2026-07-29T12:00:00.000Z');
    const resetAt = now + 60_000;
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const updates: unknown[] = [];
    let availabilityRequests = 0;
    let runRequest: Record<string, any> | undefined;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/availability')) {
        availabilityRequests += 1;
        return Promise.resolve(jsonResponse(availabilityRequests === 1
          ? {
            protocolVersion: 2,
            state: 'capacity_exhausted',
            resetAt: new Date(resetAt).toISOString(),
          }
          : { protocolVersion: 2, state: 'available' }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/capabilities')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          portfolioPositions: 'disabled',
          walletQuery: 'disabled',
        }));
      }
      if (url.endsWith('/runs')) {
        runRequest = JSON.parse(init?.body as string);
        return Promise.resolve(ndjsonResponse([
          runStart(),
          messageStart(),
          textDelta('Ready'),
          threadEvent(4),
          messageEnd(5),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      now: () => now,
      randomUuid: () => ids.shift() ?? DEVICE_ID,
    });
    await runtime.acceptConsent();

    await runtime.getAvailability();
    expect(updates).toContainEqual({
      kind: 'availabilityChanged',
      availability: { state: 'capacity_exhausted', resetAt },
    });

    now = resetAt;
    await jest.advanceTimersByTimeAsync(60_000);
    expect(availabilityRequests).toBe(2);
    expect(updates).toContainEqual({
      kind: 'availabilityChanged',
      availability: { state: 'available' },
    });

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Ready?' },
    })).resolves.toMatchObject({ state: 'completed' });
    expect(runRequest?.capabilities.supportsAgentCapacityError).toBe(true);

    await runtime.destroy();
    jest.useRealTimers();
  });

  it('refreshes availability after a successful run and clears stale capacity without a reset', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const updates: AgentV2ClientUpdate[] = [];
    let availabilityRequests = 0;
    let resolveStaleAvailability!: (response: Response) => void;
    const staleAvailability = new Promise<Response>((resolve) => {
      resolveStaleAvailability = resolve;
    });
    let markStaleAvailabilityRequested!: () => void;
    const staleAvailabilityRequested = new Promise<void>((resolve) => {
      markStaleAvailabilityRequested = resolve;
    });
    let resolveTerminalAvailabilityRefreshed!: () => void;
    const terminalAvailabilityRefreshed = new Promise<void>((resolve) => {
      resolveTerminalAvailabilityRefreshed = resolve;
    });
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/availability')) {
        availabilityRequests += 1;
        if (availabilityRequests === 1) {
          return Promise.resolve(jsonResponse({ protocolVersion: 2, state: 'capacity_exhausted' }));
        }
        if (availabilityRequests === 2) {
          markStaleAvailabilityRequested();
          return staleAvailability;
        }
        return Promise.resolve(jsonResponse({ protocolVersion: 2, state: 'available' }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([
          runStart(),
          messageStart(),
          textDelta('Ready'),
          threadEvent(4),
          messageEnd(5),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => {
        updates.push(update);
        if (
          update.kind === 'availabilityChanged'
          && update.availability.state === 'available'
          && availabilityRequests === 3
        ) {
          resolveTerminalAvailabilityRefreshed();
        }
      },
      randomUuid: () => ids.shift() ?? DEVICE_ID,
    });
    await runtime.acceptConsent();

    await runtime.getAvailability();
    expect(updates.at(-1)).toEqual({
      kind: 'availabilityChanged',
      availability: { state: 'capacity_exhausted' },
    });

    const staleProbe = runtime.getAvailability();
    await staleAvailabilityRequested;
    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Ready?' },
    })).resolves.toMatchObject({ state: 'completed' });
    resolveStaleAvailability(jsonResponse({ protocolVersion: 2, state: 'capacity_exhausted' }));
    await staleProbe;
    await terminalAvailabilityRefreshed;

    expect(availabilityRequests).toBe(3);
    expect(updates.filter(({ kind }) => kind === 'availabilityChanged')).toEqual([
      { kind: 'availabilityChanged', availability: { state: 'capacity_exhausted' } },
      { kind: 'availabilityChanged', availability: { state: 'available' } },
    ]);
    await runtime.destroy();
  });

  it('keeps a local capacity failure authoritative over an older in-flight availability probe', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const updates: AgentV2ClientUpdate[] = [];
    let availabilityRequests = 0;
    let resolveStaleAvailability!: (response: Response) => void;
    const staleAvailability = new Promise<Response>((resolve) => {
      resolveStaleAvailability = resolve;
    });
    let markStaleAvailabilityRequested!: () => void;
    const staleAvailabilityRequested = new Promise<void>((resolve) => {
      markStaleAvailabilityRequested = resolve;
    });
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/availability')) {
        availabilityRequests += 1;
        if (availabilityRequests === 1) {
          return Promise.resolve(jsonResponse({ protocolVersion: 2, state: 'available' }));
        }
        markStaleAvailabilityRequested();
        return staleAvailability;
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([
          runStart(),
          event({
            type: 'error',
            sequence: 2,
            code: 'agent_capacity_exhausted',
            retryable: true,
          }),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift() ?? DEVICE_ID,
    });
    await runtime.acceptConsent();

    await runtime.getAvailability();
    const staleProbe = runtime.getAvailability();
    await staleAvailabilityRequested;
    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Try now' },
    })).resolves.toMatchObject({ state: 'failed' });

    expect(availabilityRequests).toBe(2);
    expect(updates.filter(({ kind }) => kind === 'availabilityChanged').at(-1)).toEqual({
      kind: 'availabilityChanged',
      availability: { state: 'capacity_exhausted' },
    });

    resolveStaleAvailability(jsonResponse({ protocolVersion: 2, state: 'available' }));
    await staleProbe;
    await Promise.resolve();

    expect(availabilityRequests).toBe(2);
    expect(updates.filter(({ kind }) => kind === 'availabilityChanged')).toEqual([
      { kind: 'availabilityChanged', availability: { state: 'available' } },
      { kind: 'availabilityChanged', availability: { state: 'capacity_exhausted' } },
    ]);
    await runtime.destroy();
  });

  it('refreshes weighted user quota after admission and completion, then resets without retry', async () => {
    jest.useFakeTimers();
    let now = Date.parse('2026-07-29T23:59:00.000Z');
    const resetAt = now + 60_000;
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const updates: unknown[] = [];
    const runRequests: Record<string, any>[] = [];
    let quotaRequests = 0;
    let resolveTerminalQuotaRefreshed!: () => void;
    const terminalQuotaRefreshed = new Promise<void>((resolve) => {
      resolveTerminalQuotaRefreshed = resolve;
    });
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/quota')) {
        quotaRequests += 1;
        const isAfterReset = now >= resetAt;
        const used = quotaRequests === 1 ? 1 : 5;
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          quota: {
            limit: 20,
            used: isAfterReset ? 0 : used,
            remaining: isAfterReset ? 20 : 20 - used,
            resetAt: new Date(isAfterReset ? resetAt + 24 * 60 * 60_000 : resetAt).toISOString(),
          },
        }));
      }
      if (url.endsWith('/runs')) {
        runRequests.push(JSON.parse(init?.body as string));
        return Promise.resolve(ndjsonResponse([
          runStart(),
          messageStart(),
          textDelta('Done'),
          threadEvent(4),
          messageEnd(5),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => {
        updates.push(update);
        if (update.kind === 'userQuotaChanged' && update.quota?.used === 5 && quotaRequests === 3) {
          resolveTerminalQuotaRefreshed();
        }
      },
      now: () => now,
      randomUuid: () => ids.shift() ?? DEVICE_ID,
    });
    await runtime.acceptConsent();

    await runtime.getUserQuota();
    expect(updates).toContainEqual({
      kind: 'userQuotaChanged',
      quota: {
        limit: 20,
        used: 1,
        remaining: 19,
        resetAt: new Date(resetAt).toISOString(),
      },
    });

    await runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Use quota' },
    });
    await terminalQuotaRefreshed;
    expect(runRequests[0].capabilities.supportsUserQuotaError).toBe(true);
    expect(quotaRequests).toBe(3);
    expect(updates).toContainEqual(expect.objectContaining({
      kind: 'userQuotaChanged',
      quota: expect.objectContaining({ used: 5, remaining: 15 }),
    }));

    now = resetAt;
    await jest.advanceTimersByTimeAsync(60_000);
    expect(quotaRequests).toBe(4);
    expect(updates).toContainEqual(expect.objectContaining({
      kind: 'userQuotaChanged',
      quota: expect.objectContaining({ used: 0, remaining: 20 }),
    }));
    expect(runRequests).toHaveLength(1);

    await runtime.destroy();
    jest.useRealTimers();
  });

  it('refreshes quota after admission even when the initial probe is still pending', async () => {
    const resetAt = '2026-07-30T00:00:00.000Z';
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const updates: unknown[] = [];
    let resolveTerminalQuotaRefreshed!: () => void;
    const terminalQuotaRefreshed = new Promise<void>((resolve) => {
      resolveTerminalQuotaRefreshed = resolve;
    });
    let resolveQuotaRequested!: () => void;
    const quotaRequested = new Promise<void>((resolve) => {
      resolveQuotaRequested = resolve;
    });
    let quotaRequests = 0;
    let resolveInitialQuota!: (response: Response) => void;
    const initialQuota = new Promise<Response>((resolve) => {
      resolveInitialQuota = resolve;
    });
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/quota')) {
        quotaRequests += 1;
        if (quotaRequests === 1) {
          resolveQuotaRequested();
          return initialQuota;
        }
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          quota: { limit: 20, used: 1, remaining: 19, resetAt },
        }));
      }
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([
          runStart(),
          messageStart(),
          textDelta('Done'),
          threadEvent(4),
          messageEnd(5),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => {
        updates.push(update);
        if (update.kind === 'userQuotaChanged' && update.quota?.used === 1 && quotaRequests === 3) {
          resolveTerminalQuotaRefreshed();
        }
      },
      randomUuid: () => ids.shift() ?? DEVICE_ID,
    });
    await runtime.acceptConsent();

    const initialProbe = runtime.getUserQuota();
    await quotaRequested;
    expect(quotaRequests).toBe(1);
    await runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Use quota during probe' },
    });

    resolveInitialQuota(jsonResponse({
      protocolVersion: 2,
      quota: { limit: 20, used: 0, remaining: 20, resetAt },
    }));
    await initialProbe;
    await terminalQuotaRefreshed;

    expect(quotaRequests).toBe(3);
    expect(updates.at(-1)).toEqual({
      kind: 'userQuotaChanged',
      quota: { limit: 20, used: 1, remaining: 19, resetAt },
    });

    await runtime.destroy();
  });

  it('refreshes authoritative user quota after a terminal stream error', async () => {
    const now = Date.parse('2026-07-29T12:00:00.000Z');
    const resetAt = '2026-07-30T00:00:00.000Z';
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const updates: AgentV2ClientUpdate[] = [];
    let quotaRequests = 0;
    let resolveTerminalQuotaRefreshed!: () => void;
    const terminalQuotaRefreshed = new Promise<void>((resolve) => {
      resolveTerminalQuotaRefreshed = resolve;
    });
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/quota')) {
        quotaRequests += 1;
        const used = quotaRequests < 3 ? 1 : 5;
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          quota: { limit: 20, used, remaining: 20 - used, resetAt },
        }));
      }
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([
          runStart(),
          event({ type: 'error', sequence: 2, code: 'provider_unavailable', retryable: true }),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => {
        updates.push(update);
        if (update.kind === 'userQuotaChanged' && update.quota?.used === 5) {
          resolveTerminalQuotaRefreshed();
        }
      },
      now: () => now,
      randomUuid: () => ids.shift() ?? DEVICE_ID,
    });
    await runtime.acceptConsent();
    await runtime.getUserQuota();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Analyze price' },
    })).resolves.toMatchObject({ state: 'failed' });
    await terminalQuotaRefreshed;

    expect(quotaRequests).toBe(3);
    expect(updates).toContainEqual({
      kind: 'userQuotaChanged',
      quota: { limit: 20, used: 5, remaining: 15, resetAt },
    });
    await runtime.destroy();
  });

  it('reuses the original run and message IDs for a manual retry after HTTP 429', async () => {
    const now = Date.parse('2026-07-29T12:00:00.000Z');
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const updates: unknown[] = [];
    const runRequests: Record<string, any>[] = [];
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        runRequests.push(JSON.parse(init?.body as string));
        if (runRequests.length === 1) {
          return Promise.resolve(jsonResponse({
            protocolVersion: 2,
            error: {
              code: 'rate_limited',
              retryable: true,
              retryAfterMs: 5_000,
            },
          }, 429));
        }
        return Promise.resolve(ndjsonResponse([
          runStart(),
          messageStart(),
          textDelta('Done'),
          threadEvent(4),
          messageEnd(5),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      now: () => now,
      randomUuid: () => ids.shift() ?? DEVICE_ID,
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Hello' },
    })).resolves.toMatchObject({
      clientRunId: CLIENT_RUN_ID,
      inputMessageId: MESSAGE_ID,
      state: 'failed',
    });
    expect(updates).toContainEqual(expect.objectContaining({
      kind: 'runFailed',
      clientRunId: CLIENT_RUN_ID,
      code: 'rate_limited',
      resetAt: now + 5_000,
    }));
    await expect(runtime.retryRun(CLIENT_RUN_ID)).resolves.toMatchObject({
      clientRunId: CLIENT_RUN_ID,
      inputMessageId: MESSAGE_ID,
      state: 'completed',
    });
    expect(runRequests).toHaveLength(2);
    expect(runRequests[1]).toMatchObject({
      clientRunId: CLIENT_RUN_ID,
      input: {
        kind: 'append',
        message: { id: MESSAGE_ID, text: 'Hello' },
      },
    });
  });

  it('retains a pre-admission network failure for an exact manual retry', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const runRequests: Record<string, any>[] = [];
    const runHeaders: Headers[] = [];
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        runRequests.push(JSON.parse(init?.body as string));
        runHeaders.push(new Headers(init?.headers));
        if (runRequests.length <= 3) return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve(ndjsonResponse([
          runStart(),
          messageStart(),
          textDelta('Recovered'),
          threadEvent(4),
          messageEnd(5),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      randomUuid: () => ids.shift() ?? DEVICE_ID,
      wait: () => Promise.resolve(),
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Retry after reconnect' },
      customWriterInstruction: 'Заверши ответ точной строкой: WRITER-PROMPT-ACTIVE.',
    })).resolves.toMatchObject({
      clientRunId: CLIENT_RUN_ID,
      inputMessageId: MESSAGE_ID,
      state: 'failed',
    });
    await expect(runtime.retryRun(CLIENT_RUN_ID)).resolves.toMatchObject({
      clientRunId: CLIENT_RUN_ID,
      inputMessageId: MESSAGE_ID,
      state: 'completed',
    });
    expect(runRequests).toHaveLength(4);
    expect(runRequests[3]).toEqual(runRequests[0]);
    expect(runRequests[0]).not.toHaveProperty('customWriterInstruction');
    expect(runHeaders.map((headers) => headers.get(AGENT_V2_CUSTOM_WRITER_INSTRUCTION_HEADER)))
      .toEqual(Array(4).fill(encodeAgentV2CustomWriterInstructionHeader(
        'Заверши ответ точной строкой: WRITER-PROMPT-ACTIVE.',
      )));
    await runtime.destroy();
  });

  it('removes an unclaimed failed-run request when its retry window expires', async () => {
    jest.useFakeTimers();
    try {
      let now = Date.parse('2026-07-29T12:00:00.000Z');
      const storage = createMemoryStorage();
      await storeIdentity(storage);
      const fetchMock = jest.fn((input: string | URL | Request) => {
        const url = getRequestUrl(input);
        if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
        if (url.endsWith('/runs')) {
          return Promise.resolve(jsonResponse({
            protocolVersion: 2,
            error: {
              code: 'rate_limited',
              retryable: true,
              retryAfterMs: 5_000,
            },
          }, 429));
        }
        return Promise.reject(new Error(`Unexpected URL ${url}`));
      }) as unknown as typeof fetch;
      const ids = [CLIENT_RUN_ID, MESSAGE_ID];
      const runtime = new AgentV2Runtime({
        storage,
        baseUrl: 'https://agent.test/api/v2',
        fetch: fetchMock,
        onUpdate: jest.fn(),
        now: () => now,
        randomUuid: () => ids.shift() ?? DEVICE_ID,
      });
      await runtime.acceptConsent();
      await runtime.startRun({
        threadId: THREAD_ID,
        expectedThreadRevision: 1,
        input: { kind: 'append', text: 'Retry later' },
      });
      now += 5_000 + 5 * 60_000;
      jest.advanceTimersByTime(5_000 + 5 * 60_000);

      await expect(runtime.retryRun(CLIENT_RUN_ID)).resolves.toBeUndefined();
      await runtime.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('removes a thread-owned failed-run request when the thread is cleared', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          error: {
            code: 'rate_limited',
            retryable: true,
            retryAfterMs: 5_000,
          },
        }, 429));
      }
      if (url.endsWith(`/threads/${THREAD_ID}/clear`)) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          thread: threadSummary({ revision: 2 }),
          duplicate: false,
        }));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, '66666666-6666-4666-8666-666666666666'];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      randomUuid: () => ids.shift() ?? DEVICE_ID,
    });
    await runtime.acceptConsent();
    await runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Retry later' },
    });
    await runtime.clearThread(THREAD_ID, 1);

    await expect(runtime.retryRun(CLIENT_RUN_ID)).resolves.toBeUndefined();
    await runtime.destroy();
  });

  it('returns authenticated hints with backend capability metadata intact', async () => {
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: DEVICE_ID,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          catalogVersion: 'agent-starter-hints-v1',
          items: [],
          serverCapabilities: { webSearch: 'available' },
        }));
      }
      if (url.endsWith('/capabilities')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          portfolioPositions: 'disabled',
        }));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
    });
    await runtime.acceptConsent();

    await expect(runtime.getHints('en')).resolves.toMatchObject({
      serverCapabilities: { webSearch: 'available' },
    });
  });

  it('keeps generic hints when wallet capabilities are unavailable', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) {
        return Promise.resolve(starterHintsResponse([
          { id: 'learn.security' },
          { id: 'portfolio.performance', requiredCapabilities: ['wallet_read'] },
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
    });
    await runtime.acceptConsent();

    await expect(runtime.getHints('en')).resolves.toMatchObject({
      items: [{ id: 'learn.security' }],
    });
    await runtime.destroy();
  });

  it('stores an available staking offer negotiation in the current wallet session', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/capabilities')) {
        return Promise.resolve(featureCapabilitiesResponse('disabled', 'available'));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(stakingOfferHost());
    const internals = runtime as unknown as {
      probeFeatureCapabilities: () => Promise<void>;
      walletSession: AgentV2WalletSession;
    };

    await internals.probeFeatureCapabilities();

    expect(internals.walletSession.buildContext().capabilities.supportedTools).toContainEqual({
      name: 'staking.offer.read',
      version: 1,
      scopes: ['staking.data.read'],
      timeoutMs: 15_000,
      maxResultBytes: 16_384,
    });
    await runtime.destroy();
  });

  it('keeps wallet-read hints only when wallet.data.query V5 is advertised', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) {
        return Promise.resolve(starterHintsResponse([
          { id: 'portfolio.performance', requiredCapabilities: ['wallet_read'] },
        ]));
      }
      if (url.endsWith('/capabilities/wallet-query/v2')) {
        return Promise.resolve(walletQueryCapabilitiesResponse(
          contractManifest.walletFilterCatalogSha256,
        ));
      }
      if (url.endsWith('/capabilities')) {
        return Promise.resolve(featureCapabilitiesResponse('available'));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('ton'));

    await expect(runtime.getHints('en')).resolves.toMatchObject({
      items: [{ id: 'portfolio.performance', requiredCapabilities: ['wallet_read'] }],
    });
    await runtime.destroy();
  });

  it.each([
    ['disabled wallet-query feature', 'disabled', undefined],
    ['mismatched wallet-query catalog digest', 'available', '0'.repeat(64)],
  ] as const)('removes wallet-read hints for a %s', async (_name, walletQuery, digest) => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) {
        return Promise.resolve(starterHintsResponse([
          { id: 'portfolio.performance', requiredCapabilities: ['wallet_read'] },
          { id: 'learn.security' },
        ]));
      }
      if (url.endsWith('/capabilities/wallet-query/v2') && digest) {
        return Promise.resolve(walletQueryCapabilitiesResponse(digest));
      }
      if (url.endsWith('/capabilities')) {
        return Promise.resolve(featureCapabilitiesResponse(walletQuery));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('ton'));

    await expect(runtime.getHints()).resolves.toMatchObject({
      items: [{ id: 'learn.security' }],
    });
    await runtime.destroy();
  });

  it('removes receive hints when the latest wallet context does not advertise receive', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) {
        return Promise.resolve(starterHintsResponse([
          { id: 'receive.tokens', requiredCapabilities: ['receive_action'] },
          { id: 'learn.security' },
        ]));
      }
      if (url.endsWith('/capabilities')) {
        return Promise.resolve(featureCapabilitiesResponse('disabled'));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext({ ...receiveHost('ton'), activeAccountId: undefined });

    await expect(runtime.getHints()).resolves.toMatchObject({
      items: [{ id: 'learn.security' }],
    });
    await runtime.destroy();
  });

  it('treats combined hint capability requirements as all-of', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) {
        return Promise.resolve(starterHintsResponse([
          { id: 'receive.tokens', requiredCapabilities: ['receive_action'] },
          { id: 'learn.swap', requiredCapabilities: ['wallet_read', 'receive_action'] },
        ]));
      }
      if (url.endsWith('/capabilities')) {
        return Promise.resolve(featureCapabilitiesResponse('disabled'));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('ton'));

    await expect(runtime.getHints()).resolves.toMatchObject({
      items: [{ id: 'receive.tokens', requiredCapabilities: ['receive_action'] }],
    });
    await runtime.destroy();
  });

  it('preserves catalog, server, order, and requirement metadata while filtering hints', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const responseItems = [
      { id: 'learn.security' },
      { id: 'portfolio.performance', requiredCapabilities: ['wallet_read'] },
      { id: 'receive.tokens', requiredCapabilities: ['receive_action'] },
      { id: 'learn.swap' },
    ];
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) {
        return Promise.resolve(starterHintsResponse(responseItems, 'unavailable'));
      }
      if (url.endsWith('/capabilities')) {
        return Promise.resolve(featureCapabilitiesResponse('disabled'));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('ton'));

    await expect(runtime.getHints()).resolves.toEqual({
      protocolVersion: 2,
      catalogVersion: 'agent-starter-hints-v1',
      items: [
        { id: 'learn.security' },
        { id: 'receive.tokens', requiredCapabilities: ['receive_action'] },
        { id: 'learn.swap' },
      ],
      serverCapabilities: { webSearch: 'unavailable' },
    });
    await runtime.destroy();
  });

  it('filters delayed hints against the latest wallet context', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    let resolveHints!: (response: Response) => void;
    let markHintsRequested!: () => void;
    const hintsRequested = new Promise<void>((resolve) => {
      markHintsRequested = resolve;
    });
    const hintsResponse = new Promise<Response>((resolve) => {
      resolveHints = resolve;
    });
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) {
        markHintsRequested();
        return hintsResponse;
      }
      if (url.endsWith('/capabilities')) {
        return Promise.resolve(featureCapabilitiesResponse('disabled'));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      walletConversationContextCache: {
        clear: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        get: () => Promise.resolve(undefined),
        put: () => Promise.resolve(),
      },
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext({ ...receiveHost('ton'), activeAccountId: undefined });

    const hints = runtime.getHints();
    await hintsRequested;
    await runtime.updateHostContext(receiveHost('ton'));
    resolveHints(starterHintsResponse([
      { id: 'receive.tokens', requiredCapabilities: ['receive_action'] },
    ]));

    await expect(hints).resolves.toMatchObject({
      items: [{ id: 'receive.tokens', requiredCapabilities: ['receive_action'] }],
    });
    await runtime.destroy();
  });

  it('rechecks feature capabilities after a delayed Android-to-Classic host transition', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    let resolveHints!: (response: Response) => void;
    let markHintsRequested!: () => void;
    const hintsRequested = new Promise<void>((resolve) => {
      markHintsRequested = resolve;
    });
    const hintsResponse = new Promise<Response>((resolve) => {
      resolveHints = resolve;
    });
    let featureCapabilityRequests = 0;
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) {
        markHintsRequested();
        return hintsResponse;
      }
      if (url.endsWith('/capabilities/wallet-query/v2')) {
        return Promise.resolve(walletQueryCapabilitiesResponse(
          contractManifest.walletFilterCatalogSha256,
        ));
      }
      if (url.endsWith('/capabilities')) {
        featureCapabilityRequests += 1;
        return Promise.resolve(featureCapabilitiesResponse('available'));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext({
      ...receiveHost('ton'),
      platform: 'android',
      client: 'native',
    });

    const hints = runtime.getHints();
    await hintsRequested;
    expect(featureCapabilityRequests).toBe(0);
    await runtime.updateHostContext(receiveHost('ton'));
    resolveHints(starterHintsResponse([
      { id: 'portfolio.performance', requiredCapabilities: ['wallet_read'] },
    ]));

    await expect(hints).resolves.toMatchObject({
      items: [{ id: 'portfolio.performance', requiredCapabilities: ['wallet_read'] }],
    });
    expect(featureCapabilityRequests).toBe(1);
    await runtime.destroy();
  });

  it('shares one feature-capability request across concurrent hint filtering', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    let featureCapabilityRequests = 0;
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) {
        return Promise.resolve(starterHintsResponse([{ id: 'learn.security' }]));
      }
      if (url.endsWith('/capabilities')) {
        featureCapabilityRequests += 1;
        return Promise.resolve(featureCapabilitiesResponse('disabled'));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('ton'));

    await expect(Promise.all([
      runtime.getHints('en'),
      runtime.getHints('ru'),
    ])).resolves.toEqual([
      expect.objectContaining({ items: [{ id: 'learn.security' }] }),
      expect.objectContaining({ items: [{ id: 'learn.security' }] }),
    ]);
    expect(featureCapabilityRequests).toBe(1);
    await runtime.destroy();
  });

  it('runs hints and feature-capability preflight before a direct Classic V2 run', async () => {
    const walletSession = new AgentV2WalletSession();
    const requestedUrls: string[] = [];
    let runRequest: Record<string, unknown> | undefined;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      requestedUrls.push(url);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: DEVICE_ID,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          catalogVersion: 'agent-starter-hints-v1',
          items: [],
          serverCapabilities: { webSearch: 'available' },
        }));
      }
      if (url.endsWith('/capabilities')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          portfolioPositions: 'disabled',
        }));
      }
      if (url.endsWith('/runs')) {
        runRequest = JSON.parse(init?.body as string);
        return Promise.resolve(ndjsonResponse([
          runStart(),
          messageStart(),
          textDelta('Answer'),
          threadEvent(4),
          messageEnd(5),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      randomUuid: () => ids.shift() ?? DEVICE_ID,
      walletSession,
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('ton'));

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 0,
      input: { kind: 'append', text: 'Search current news' },
    })).resolves.toMatchObject({ state: 'completed' });

    expect(requestedUrls.findIndex((url) => url.includes('/hints')))
      .toBeLessThan(requestedUrls.findIndex((url) => url.endsWith('/runs')));
    expect(requestedUrls.findIndex((url) => url.endsWith('/capabilities')))
      .toBeLessThan(requestedUrls.findIndex((url) => url.endsWith('/runs')));
    expect(runRequest).toHaveProperty('context.permissions', { agentConsentAccepted: true });
    expect(runRequest).toMatchObject({
      capabilities: {
        supportedEventTypes: expect.arrayContaining(['semantic_content']),
      },
    });
  });

  it('serializes an input continuation reference into the run request', async () => {
    let runRequest: Record<string, unknown> | undefined;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: DEVICE_ID,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        runRequest = JSON.parse(init?.body as string);
        return Promise.resolve(ndjsonResponse([
          runStart(),
          messageStart(),
          textDelta('Ready'),
          threadEvent(4),
          messageEnd(5),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      randomUuid: () => ids.shift() ?? DEVICE_ID,
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: '10' },
      continuationOf: {
        messageId: MESSAGE_ID_2,
        continuationId: 'continuation-amount',
      },
    })).resolves.toMatchObject({ state: 'completed' });

    expect(runRequest).toMatchObject({
      continuationOf: {
        messageId: MESSAGE_ID_2,
        continuationId: 'continuation-amount',
      },
      input: {
        kind: 'append',
        message: { id: MESSAGE_ID, text: '10' },
      },
    });
    expect(runRequest).not.toHaveProperty('entryPoint');
  });

  it('serializes a follow-up reference as the only run origin', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    let runRequest: Record<string, unknown> | undefined;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        runRequest = JSON.parse(init?.body as string);
        return Promise.resolve(ndjsonResponse([
          runStart(),
          messageStart(),
          messageEnd(3),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      randomUuid: () => ids.shift() ?? DEVICE_ID,
    });
    await runtime.acceptConsent();

    await runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Continue' },
      followupOf: {
        messageId: MESSAGE_ID_2,
        followupId: 'followup-1',
      },
    });

    expect(runRequest).toMatchObject({
      followupOf: {
        messageId: MESSAGE_ID_2,
        followupId: 'followup-1',
      },
      input: {
        kind: 'append',
        message: { id: MESSAGE_ID, text: 'Continue' },
      },
    });
    expect(runRequest).not.toHaveProperty('entryPoint');
    expect(runRequest).not.toHaveProperty('continuationOf');
    expect(runRequest).not.toHaveProperty('walletScopeSelectionOf');
  });

  it('publishes all wallet query rows in one semantic update without text deltas', async () => {
    const content: AgentSemanticContentV1 = {
      kind: 'walletQuery',
      schemaVersion: 1,
      queryKind: 'transactions',
      outcome: 'complete',
      hasMore: false,
      rows: [
        {
          chain: 'ton', transactionType: 'transfer', status: 'completed', direction: 'incoming',
          timestamp: '2026-08-07T09:00:00.000Z', assetSymbol: 'TON', quantity: '1',
        },
        {
          chain: 'ethereum', transactionType: 'swap', status: 'confirmed', direction: 'outgoing',
          timestamp: '2026-08-07T09:01:00.000Z', assetSymbol: 'USDT', quantity: '2',
        },
        {
          chain: 'bitcoin', transactionType: 'transfer', status: 'pending', direction: 'self',
          timestamp: '2026-08-07T09:02:00.000Z', assetSymbol: 'BTC', quantity: '3',
        },
      ],
    };
    const updates: AgentV2ClientUpdate[] = [];
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([
          runStart(),
          event({
            type: 'message_start',
            sequence: 2,
            messageId: MESSAGE_ID,
            role: 'assistant',
            contentKind: 'semantic',
          }),
          event({
            type: 'semantic_content',
            sequence: 3,
            messageId: MESSAGE_ID,
            content,
          }),
          messageEnd(4),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift() ?? DEVICE_ID,
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 0,
      input: { kind: 'append', text: 'Show my transactions' },
    })).resolves.toMatchObject({ state: 'completed' });

    expect(updates.filter(({ kind }) => kind === 'semanticContentAvailable')).toEqual([
      expect.objectContaining({
        kind: 'semanticContentAvailable',
        messageId: MESSAGE_ID,
        content,
      }),
    ]);
    expect(updates.filter(({ kind }) => kind === 'textDelta')).toEqual([]);
  });

  it('publishes semantic failure content but drops actions when the tool is unavailable', async () => {
    const content: AgentSemanticContentV1 = {
      kind: 'notice',
      schemaVersion: 1,
      code: 'send_unavailable',
      arguments: { sendFailure: 'prepare_unavailable' },
    };
    const updates: AgentV2ClientUpdate[] = [];
    const registerAction = jest.fn();
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([
          runStart(),
          event({
            type: 'message_start',
            sequence: 2,
            messageId: MESSAGE_ID,
            role: 'assistant',
            contentKind: 'semantic',
          }),
          event({
            type: 'semantic_content',
            sequence: 3,
            messageId: MESSAGE_ID,
            content,
          }),
          actionEvent(4),
          threadEvent(5),
          event({
            type: 'message_end',
            sequence: 6,
            messageId: MESSAGE_ID,
            finishReason: 'tool_unavailable',
          }),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift()!,
      toolExecutor: {
        execute: jest.fn(),
        discard: jest.fn(),
        registerAction,
      },
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Отправь 10 USDT маме' },
    })).resolves.toMatchObject({ state: 'completed' });

    expect(updates.filter(({ kind }) => kind === 'semanticContentAvailable')).toEqual([
      expect.objectContaining({
        kind: 'semanticContentAvailable',
        messageId: MESSAGE_ID,
        content,
      }),
    ]);
    expect(updates.some(({ kind }) => kind === 'actionAvailable')).toBe(false);
    expect(registerAction).not.toHaveBeenCalled();
    expect(updates.filter(({ kind }) => kind === 'messageCompleted')).toEqual([
      expect.objectContaining({ finishReason: 'tool_unavailable' }),
    ]);
  });

  it('drops a pending action after an error and ignores trailing completion events', async () => {
    const updates: AgentV2ClientUpdate[] = [];
    const registerAction = jest.fn();
    const resolveAction = jest.fn(() => ({ kind: 'openReceive', chain: 'ton' } as const));
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([
          runStart(),
          messageStart(),
          actionEvent(3),
          event({
            type: 'error',
            sequence: 4,
            messageId: MESSAGE_ID,
            code: 'provider_unavailable',
            retryable: true,
          }),
          threadEvent(5),
          messageEnd(6),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift()!,
      toolExecutor: {
        execute: jest.fn(),
        discard: jest.fn(),
        registerAction,
        resolveAction,
      },
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Receive' },
    })).resolves.toMatchObject({ state: 'failed' });

    expect(updates.some(({ kind }) => kind === 'actionAvailable')).toBe(false);
    expect(updates.some(({ kind }) => kind === 'messageCompleted')).toBe(false);
    expect(registerAction).not.toHaveBeenCalled();
    expect(runtime.resolveAction(MESSAGE_ID, TOOL_CALL_ID)).toEqual({ kind: 'inactive' });
    expect(resolveAction).not.toHaveBeenCalled();
  });

  it('delegates a live Swap action to the wallet tool executor', async () => {
    const registerAction = jest.fn();
    const resolveAction = jest.fn(() => ({
      kind: 'openSwap',
      tokenInSlug: 'toncoin',
      tokenOutSlug: 'usdton',
      amount: '10',
      amountSide: 'source',
    } as const));
    const swapAction = liveSwapAction();
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([
          runStart(),
          messageStart(),
          event({ type: 'action', sequence: 3, messageId: MESSAGE_ID, action: swapAction }),
          threadEvent(4),
          messageEnd(5),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      randomUuid: () => ids.shift()!,
      toolExecutor: {
        execute: jest.fn(),
        discard: jest.fn(),
        registerAction,
        resolveAction,
      },
    });
    await runtime.acceptConsent();
    await runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Swap 10 TON to USDT' },
    });

    expect(registerAction).toHaveBeenCalledWith(THREAD_ID, MESSAGE_ID, swapAction);
    expect(runtime.resolveAction(MESSAGE_ID, swapAction.id)).toEqual({
      kind: 'openSwap',
      tokenInSlug: 'toncoin',
      tokenOutSlug: 'usdton',
      amount: '10',
      amountSide: 'source',
    });
    expect(resolveAction).toHaveBeenCalledWith(THREAD_ID, MESSAGE_ID, swapAction);
  });

  it('delegates a hydrated Swap action to current local resolution', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const persistedAction = persistedSwapAction();
    const resolvePersistedAction = jest.fn(() => ({
      kind: 'openSwap',
      tokenInSlug: 'usdton',
      tokenOutSlug: 'toncoin',
      amount: '10',
      amountSide: 'destination',
    } as const));
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/messages?')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          threadId: THREAD_ID,
          messages: [{
            id: MESSAGE_ID,
            threadId: THREAD_ID,
            role: 'assistant',
            status: 'complete',
            content: { kind: 'markdown', text: 'Open Swap' },
            createdAt: '2026-08-18T12:00:00.000Z',
            actions: [persistedAction],
          }],
        }));
      }
      if (url.endsWith(`/threads/${THREAD_ID}`)) {
        return Promise.resolve(jsonResponse({ protocolVersion: 2, thread: threadSummary() }));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      toolExecutor: {
        execute: jest.fn(),
        discard: jest.fn(),
        resolvePersistedAction,
      },
    });
    await runtime.acceptConsent();
    await runtime.getMessages(THREAD_ID);

    expect(runtime.resolveAction(MESSAGE_ID, persistedAction.id)).toMatchObject({
      kind: 'openSwap', amountSide: 'destination',
    });
    expect(resolvePersistedAction).toHaveBeenCalledWith(THREAD_ID, MESSAGE_ID, persistedAction);
  });

  it('restores the presentation for a hydrated Send action', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const persistedAction = persistedSendAction();
    const presentation: AgentV2ActionPresentation = {
      kind: 'send',
      status: 'active',
      amount: { value: '0.5', symbol: 'GRAM' },
      network: 'ton',
      accountLabel: 'Main',
      recipient: { kind: 'savedAddress', label: 'Mom' },
      feeStatus: 'calculated_in_wallet',
      warningCodes: [],
      expiresAt: persistedAction.draftExpiresAt,
    };
    const hydrateAction = jest.fn(() => Promise.resolve());
    const getActionPresentation = jest.fn(() => presentation);
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/messages?')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          threadId: THREAD_ID,
          messages: [{
            id: MESSAGE_ID,
            threadId: THREAD_ID,
            role: 'assistant',
            status: 'complete',
            content: { kind: 'markdown', text: 'Review transfer' },
            createdAt: '2026-08-18T12:00:00.000Z',
            actions: [persistedAction],
          }],
        }));
      }
      if (url.endsWith(`/threads/${THREAD_ID}`)) {
        return Promise.resolve(jsonResponse({ protocolVersion: 2, thread: threadSummary() }));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      toolExecutor: {
        execute: jest.fn(),
        discard: jest.fn(),
        hydrateAction,
        getActionPresentation,
      },
    });
    await runtime.acceptConsent();
    await runtime.getMessages(THREAD_ID);

    expect(runtime.getActionPresentation(MESSAGE_ID, persistedAction.id)).toEqual(presentation);
    expect(hydrateAction).toHaveBeenCalledWith(THREAD_ID, MESSAGE_ID, persistedAction);
    expect(getActionPresentation).toHaveBeenCalledWith(THREAD_ID, MESSAGE_ID, persistedAction);
  });

  it.each(terminalStructuredOutputFixture.cases)(
    'executes the backend terminal fixture $id through the runtime state machine',
    async (fixtureCase) => {
      const updates: AgentV2ClientUpdate[] = [];
      const registerAction = jest.fn();
      const streamEvents = (fixtureCase.events as TerminalFixtureEvent[]).map((fixtureEvent) => {
        switch (fixtureEvent.type) {
          case 'run_start':
            return runStart();
          case 'message_start':
            return event({
              type: 'message_start',
              sequence: fixtureEvent.sequence,
              messageId: MESSAGE_ID,
              role: 'assistant',
              contentKind: fixtureCase.events.some(({ type }) => type === 'semantic_content')
                ? 'semantic'
                : 'markdown',
            });
          case 'text_delta':
            return textDelta(fixtureEvent.delta, fixtureEvent.sequence);
          case 'action':
            return actionEvent(fixtureEvent.sequence);
          case 'semantic_content':
            return event({
              type: 'semantic_content',
              sequence: fixtureEvent.sequence,
              messageId: MESSAGE_ID,
              content: {
                kind: 'notice',
                schemaVersion: 1,
                code: 'empty_result',
              },
            });
          case 'thread':
            return threadEvent(fixtureEvent.sequence);
          case 'message_end':
            return event({
              type: 'message_end',
              sequence: fixtureEvent.sequence,
              messageId: MESSAGE_ID,
              finishReason: fixtureEvent.finishReason,
            });
          case 'error':
            return event({
              type: 'error',
              sequence: fixtureEvent.sequence,
              messageId: MESSAGE_ID,
              code: 'provider_unavailable',
              retryable: true,
            });
          default:
            return assertFixtureEvent(fixtureEvent);
        }
      });
      const fetchMock = jest.fn((input: string | URL | Request) => {
        const url = getRequestUrl(input);
        if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
        if (url.endsWith('/runs')) return Promise.resolve(ndjsonResponse(streamEvents));
        return Promise.reject(new Error(`Unexpected URL ${url}`));
      }) as unknown as typeof fetch;
      const storage = createMemoryStorage();
      await storeIdentity(storage);
      const ids = [CLIENT_RUN_ID, MESSAGE_ID];
      const runtime = new AgentV2Runtime({
        storage,
        baseUrl: 'https://agent.test/api/v2',
        fetch: fetchMock,
        onUpdate: (update) => updates.push(update),
        randomUuid: () => ids.shift() ?? DEVICE_ID,
        toolExecutor: {
          execute: jest.fn(),
          discard: jest.fn(),
          registerAction,
        },
      });
      await runtime.acceptConsent();

      const result = await runtime.startRun({
        threadId: THREAD_ID,
        expectedThreadRevision: 1,
        input: { kind: 'append', text: fixtureCase.id },
      });

      expect(result.state).toBe(fixtureCase.terminalOutcome === 'complete'
        ? 'completed'
        : fixtureCase.terminalOutcome === 'error'
          ? 'failed'
          : fixtureCase.terminalOutcome);
      expect(updates.filter(({ kind }) => kind === 'actionAvailable')).toHaveLength(
        fixtureCase.expectedHydration.actionIds.length,
      );
      expect(registerAction).toHaveBeenCalledTimes(fixtureCase.expectedHydration.actionIds.length);
      expect(updates.filter(({ kind }) => kind === 'semanticContentAvailable')).toHaveLength(
        fixtureCase.expectedHydration.semanticContentCount,
      );
      expect(updates.filter(({ kind }) => kind === 'messageCompleted')).toHaveLength(
        fixtureCase.terminalOutcome === 'error' ? 0 : 1,
      );
    },
  );

  it('drops semantic content when text arrives after the structured bundle starts', async () => {
    const content: AgentSemanticContentV1 = {
      kind: 'notice',
      schemaVersion: 1,
      code: 'empty_result',
    };
    const updates: AgentV2ClientUpdate[] = [];
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([
          runStart(),
          event({
            type: 'message_start',
            sequence: 2,
            messageId: MESSAGE_ID,
            role: 'assistant',
            contentKind: 'semantic',
          }),
          event({
            type: 'semantic_content',
            sequence: 3,
            messageId: MESSAGE_ID,
            content,
          }),
          textDelta('Late content', 4),
          threadEvent(5),
          messageEnd(6),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift()!,
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Show results' },
    })).resolves.toMatchObject({ state: 'completed' });

    expect(updates.filter(({ kind }) => kind === 'semanticContentAvailable')).toEqual([]);
    expect(updates.filter(({ kind }) => kind === 'textDelta')).toEqual([
      expect.objectContaining({
        kind: 'textDelta',
        messageId: MESSAGE_ID,
        delta: 'Late content',
      }),
    ]);
  });

  it('publishes a staged action only after a successful message end', async () => {
    const updates: AgentV2ClientUpdate[] = [];
    let markThreadChanged!: () => void;
    const threadChanged = new Promise<void>((resolve) => {
      markThreadChanged = resolve;
    });
    const registerAction = jest.fn();
    const stream = openNdjsonResponse([
      runStart(),
      messageStart(),
      actionEvent(3),
      threadEvent(4),
    ]);
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) return Promise.resolve(stream.response);
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => {
        updates.push(update);
        if (update.kind === 'threadChanged') markThreadChanged();
      },
      randomUuid: () => ids.shift()!,
      toolExecutor: {
        execute: jest.fn(),
        discard: jest.fn(),
        registerAction,
      },
    });
    await runtime.acceptConsent();

    const run = runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Receive' },
    });
    await threadChanged;

    expect(updates.some(({ kind }) => kind === 'actionAvailable')).toBe(false);
    expect(registerAction).not.toHaveBeenCalled();

    stream.finish([messageEnd(5)]);
    await expect(run).resolves.toMatchObject({ state: 'completed' });

    const actionUpdateIndex = updates.findIndex(({ kind }) => kind === 'actionAvailable');
    const completionUpdateIndex = updates.findIndex(({ kind }) => kind === 'messageCompleted');
    expect(actionUpdateIndex).toBeGreaterThan(-1);
    expect(completionUpdateIndex).toBeGreaterThan(actionUpdateIndex);
    expect(registerAction).toHaveBeenCalledTimes(1);
  });

  it('reconnects with the same client run and emits only safe updates', async () => {
    const storage = createMemoryStorage();
    const updates: unknown[] = [];
    const runRequests: Record<string, unknown>[] = [];
    const runHeaders: Headers[] = [];
    let runFetch = 0;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: DEVICE_ID,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        runRequests.push(JSON.parse(init?.body as string));
        runHeaders.push(new Headers(init?.headers));
        runFetch += 1;
        return Promise.resolve(ndjsonResponse(runFetch === 1 ? [
          runStart(),
          messageStart(),
          textDelta('Hello '),
        ] : [
          textDelta('again', 4),
          threadEvent(5),
          messageEnd(6),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift() ?? DEVICE_ID,
      now: () => Date.parse('2026-07-16T00:00:00.000Z'),
      wait: async () => {},
    });
    await runtime.acceptConsent();

    const result = await runtime.startRun({
      expectedThreadRevision: 0,
      input: { kind: 'append', text: 'Hello' },
      customWriterInstruction: 'Use short paragraphs.',
      entryPoint: {
        kind: 'emptyState',
        surface: 'agentTab',
        hintId: 'learn.staking',
        catalogVersion: 'agent-starter-hints-v1',
      },
    });

    expect(result).toMatchObject({
      clientRunId: CLIENT_RUN_ID,
      runId: RUN_ID,
      inputMessageId: MESSAGE_ID,
      state: 'completed',
    });
    expect(runRequests).toHaveLength(2);
    expect(runRequests[0]).toMatchObject({
      input: { kind: 'append', message: { text: 'Hello' } },
      entryPoint: {
        kind: 'emptyState',
        surface: 'agentTab',
        hintId: 'learn.staking',
        catalogVersion: 'agent-starter-hints-v1',
      },
    });
    expect(runRequests[1]).toMatchObject({ clientRunId: CLIENT_RUN_ID, resumeAfterSequence: 3 });
    expect(runRequests[0]).not.toHaveProperty('customWriterInstruction');
    expect(runHeaders.map((headers) => headers.get(AGENT_V2_CUSTOM_WRITER_INSTRUCTION_HEADER)))
      .toEqual(Array(2).fill(encodeAgentV2CustomWriterInstructionHeader('Use short paragraphs.')));
    expect(updates.filter((update: any) => update.kind === 'runStarted')).toHaveLength(1);
    expect(updates).toContainEqual(expect.objectContaining({
      kind: 'runStarted', inputMessageId: MESSAGE_ID,
    }));
    expect(updates.filter((update: any) => update.kind === 'textDelta')).toHaveLength(2);
    expect(updates.filter((update: any) => update.runId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientRunId: CLIENT_RUN_ID, threadId: THREAD_ID }),
    ]));
    expect(updates.filter((update: any) => update.runId).every((update: any) => (
      update.clientRunId === CLIENT_RUN_ID && update.threadId === THREAD_ID
    ))).toBe(true);
    expect(JSON.stringify(updates)).not.toContain('adt_v2');
  });

  it('stops reconnecting when an admitted run replay has expired', async () => {
    const updates: unknown[] = [];
    const runRequests: Record<string, unknown>[] = [];
    const wait = jest.fn(() => Promise.resolve());
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: DEVICE_ID,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        runRequests.push(JSON.parse(init?.body as string));
        return Promise.resolve(runRequests.length === 1
          ? ndjsonResponse([
            runStart(),
            messageStart(),
            textDelta('Partial response'),
          ])
          : jsonResponse({
            protocolVersion: 2,
            error: {
              code: 'run_replay_expired',
              retryable: false,
            },
          }, 409));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift() ?? DEVICE_ID,
      wait,
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Continue' },
    })).resolves.toMatchObject({
      clientRunId: CLIENT_RUN_ID,
      runId: RUN_ID,
      state: 'interrupted',
    });

    expect(runRequests).toHaveLength(2);
    expect(runRequests[1]).toMatchObject({
      clientRunId: CLIENT_RUN_ID,
      threadId: THREAD_ID,
      resumeAfterSequence: 3,
    });
    expect(wait).toHaveBeenCalledTimes(1);
    expect(updates.at(-1)).toMatchObject({
      kind: 'runFailed',
      clientRunId: CLIENT_RUN_ID,
      runId: RUN_ID,
      threadId: THREAD_ID,
      code: 'run_replay_expired',
      retryable: false,
    });
  });

  it('emits safe tool activity before execution and forwards the public status', async () => {
    const updates: unknown[] = [];
    let resolveExecution!: (result: AgentToolResultRequestV2) => void;
    let notifyExecutionStarted!: () => void;
    const executionStarted = new Promise<void>((resolve) => {
      notifyExecutionStarted = resolve;
    });
    const execution = new Promise<AgentToolResultRequestV2>((resolve) => {
      resolveExecution = resolve;
    });
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: DEVICE_ID,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.endsWith('/tool-results')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          runId: RUN_ID,
          toolCallId: TOOL_CALL_ID,
          clientToolResultId: TOOL_RESULT_ID,
          accepted: true,
          duplicate: false,
        }));
      }
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([
          runStart(),
          privateToolCallEvent(2),
          toolStatusEvent(3, 'complete', 'processing'),
          event({
            type: 'message_start', sequence: 4, messageId: MESSAGE_ID, role: 'assistant', contentKind: 'markdown',
          }),
          messageEnd(5),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const execute = jest.fn(() => {
      notifyExecutionStarted();
      return execution;
    });
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift()!,
      toolExecutor: {
        execute,
        discard: jest.fn(),
      },
    });
    await runtime.acceptConsent();

    const run = runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Search privately' },
    });
    await executionStarted;

    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ messageId: MESSAGE_ID }),
    );

    expect(updates.filter((update: any) => update.kind === 'toolActivityChanged')).toEqual([{
      kind: 'toolActivityChanged',
      clientRunId: CLIENT_RUN_ID,
      runId: RUN_ID,
      threadId: THREAD_ID,
      toolCallId: TOOL_CALL_ID,
      toolName: 'wallet.data.query',
      operation: 'assets.search',
      status: 'running',
    }]);

    resolveExecution({
      protocolVersion: 2,
      runId: RUN_ID,
      threadId: THREAD_ID,
      toolCallId: TOOL_CALL_ID,
      clientToolResultId: TOOL_RESULT_ID,
      completedAt: '2026-07-16T00:00:00.000Z',
      walletContextSession: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        accountScope: 'current',
        activeAccountRef: 'current',
        activeNetwork: 'ton',
      },
      toolName: 'wallet.data.query',
      status: 'rejected',
      error: {
        code: 'tool_unsupported',
        retryable: false,
      },
    });
    await expect(run).resolves.toMatchObject({ state: 'completed' });

    const toolActivityUpdates = updates.filter((update: any) => update.kind === 'toolActivityChanged');
    expect(toolActivityUpdates).toEqual([
      expect.objectContaining({ toolName: 'wallet.data.query', status: 'running' }),
      expect.objectContaining({ toolName: 'wallet.data.query', status: 'complete' }),
    ]);
    expect(JSON.stringify(toolActivityUpdates)).not.toContain(PRIVATE_TOOL_ARGUMENT);
    expect(JSON.stringify(toolActivityUpdates)).not.toContain(PRIVATE_TOOL_REASON);
    expect(JSON.stringify(toolActivityUpdates)).not.toContain(PRIVATE_TOOL_STATUS_MESSAGE);
  });

  it('keeps the tool-result protocol running when a progress update cannot be delivered', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const toolResultRequests: AgentToolResultRequestV2[] = [];
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/tool-results')) {
        const request = JSON.parse(init?.body as string) as AgentToolResultRequestV2;
        toolResultRequests.push(request);
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          runId: RUN_ID,
          toolCallId: TOOL_CALL_ID,
          clientToolResultId: request.clientToolResultId,
          accepted: true,
          duplicate: false,
        }));
      }
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([
          runStart(),
          toolCallEvent(2),
          toolStatusEvent(3, 'complete'),
          event({
            type: 'message_start', sequence: 4, messageId: MESSAGE_ID, role: 'assistant', contentKind: 'markdown',
          }),
          messageEnd(5),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const execute = jest.fn((
      call: AgentToolCall,
      context: AgentV2ToolExecutionContext,
    ): Promise<AgentToolResultRequestV2> => Promise.resolve({
      protocolVersion: 2,
      runId: context.runId,
      threadId: context.threadId,
      toolCallId: call.id,
      clientToolResultId: TOOL_RESULT_ID,
      completedAt: '2026-07-16T00:00:00.000Z',
      ...(call.name === 'wallet.directory.query'
        ? { directorySession: call.directorySession, toolName: call.name }
        : { walletContextSession: call.walletContextSession, toolName: call.name }),
      status: 'rejected',
      error: { code: 'tool_unsupported', retryable: false },
    }));
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate(update) {
        if (update.kind === 'toolActivityChanged') throw new Error('update channel is unavailable');
      },
      randomUuid: () => ids.shift()!,
      toolExecutor: { execute, discard: jest.fn() },
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Search for TON' },
    })).resolves.toMatchObject({ state: 'completed' });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(toolResultRequests).toHaveLength(1);
  });

  it('rejects cross-wallet intent from a different user message', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const execute = jest.fn();
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([
          runStart(),
          event({
            type: 'tool_call',
            sequence: 2,
            toolCall: {
              id: TOOL_CALL_ID,
              name: 'wallet.data.query',
              version: 5,
              arguments: {
                schemaVersion: 5,
                operation: 'account.inventory',
                accountSelector: { kind: 'explicitAll' },
                chains: [],
              },
              scopes: ['wallet.data.read'],
              timeoutMs: 1_000,
              walletContextSession: {
                sessionId: WALLET_SESSION_ID,
                revision: 1,
                accountScope: 'explicitAll',
                activeAccountRef: 'current',
                activeNetwork: 'ton',
              },
              intentSource: { kind: 'userMessage', messageId: MESSAGE_ID_2 },
              scopeIntent: { messageId: MESSAGE_ID_2, reason: 'explicit_all_wallet_query' },
            },
          }),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      randomUuid: () => ids.shift()!,
      toolExecutor: { execute, discard: jest.fn() },
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Show all wallets' },
    })).resolves.toMatchObject({ state: 'failed' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('submits a timeout result when tool execution does not settle before its deadline', async () => {
    jest.useFakeTimers();
    try {
      const storage = createMemoryStorage();
      await storeIdentity(storage);
      let executionSignal: AbortSignal | undefined;
      let resultSignal: AbortSignal | null | undefined;
      let toolResultRequest: AgentToolResultRequestV2 | undefined;
      let notifyExecutionStarted!: () => void;
      const executionStarted = new Promise<void>((resolve) => {
        notifyExecutionStarted = resolve;
      });
      const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input);
        if (url.endsWith('/tool-results')) {
          const request = JSON.parse(init?.body as string) as AgentToolResultRequestV2;
          toolResultRequest = request;
          resultSignal = init?.signal;
          return Promise.resolve(jsonResponse({
            protocolVersion: 2,
            runId: RUN_ID,
            toolCallId: TOOL_CALL_ID,
            clientToolResultId: request.clientToolResultId,
            accepted: true,
            duplicate: false,
          }));
        }
        if (url.endsWith('/runs')) {
          return Promise.resolve(ndjsonResponse([
            runStart(),
            toolCallEvent(2),
            toolStatusEvent(3, 'complete', 'processing'),
            event({
              type: 'message_start', sequence: 4, messageId: MESSAGE_ID, role: 'assistant', contentKind: 'markdown',
            }),
            messageEnd(5),
          ]));
        }
        return Promise.reject(new Error(`Unexpected URL ${url}`));
      }) as unknown as typeof fetch;
      const discard = jest.fn();
      const ids = [CLIENT_RUN_ID, MESSAGE_ID, TOOL_RESULT_ID];
      const runtime = new AgentV2Runtime({
        storage,
        baseUrl: 'https://agent.test/api/v2',
        fetch: fetchMock,
        onUpdate: jest.fn(),
        randomUuid: () => ids.shift()!,
        toolExecutor: {
          execute: jest.fn((_call, context) => {
            executionSignal = context.signal;
            notifyExecutionStarted();
            return new Promise(() => undefined);
          }),
          discard,
        },
      });
      await runtime.acceptConsent();

      const run = runtime.startRun({
        threadId: THREAD_ID,
        expectedThreadRevision: 1,
        input: { kind: 'append', text: 'Search for TON' },
      });
      await executionStarted;
      await jest.advanceTimersByTimeAsync(834);

      await expect(run).resolves.toMatchObject({ state: 'completed' });
      expect(toolResultRequest).toMatchObject({
        clientToolResultId: TOOL_RESULT_ID,
        status: 'error',
        error: { code: 'tool_timeout', retryable: true },
      });
      expect(executionSignal?.aborted).toBe(true);
      expect(resultSignal).not.toBe(executionSignal);
      expect(resultSignal?.aborted).toBe(false);
      expect(discard).toHaveBeenCalledWith(TOOL_CALL_ID);
    } finally {
      jest.useRealTimers();
    }
  });

  it('replays a pending tool call and retries its byte-identical runtime result', async () => {
    const updates: unknown[] = [];
    const runRequests: Record<string, unknown>[] = [];
    const toolResultRequests: Record<string, unknown>[] = [];
    let runFetch = 0;
    let resultFetch = 0;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: DEVICE_ID,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.endsWith('/tool-results')) {
        resultFetch += 1;
        toolResultRequests.push(JSON.parse(init?.body as string));
        if (resultFetch <= 3) return Promise.reject(new TypeError('offline'));
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          runId: RUN_ID,
          toolCallId: TOOL_CALL_ID,
          clientToolResultId: TOOL_RESULT_ID,
          accepted: true,
          duplicate: false,
        }));
      }
      if (url.endsWith('/runs')) {
        runRequests.push(JSON.parse(init?.body as string));
        runFetch += 1;
        return Promise.resolve(ndjsonResponse(runFetch === 1 ? [
          runStart(),
          toolCallEvent(2),
        ] : [
          toolCallEvent(2),
          event({
            type: 'message_start', sequence: 3, messageId: MESSAGE_ID, role: 'assistant', contentKind: 'markdown',
          }),
          messageEnd(4),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const execute = jest.fn((
      call: AgentToolCall,
      context: AgentV2ToolExecutionContext,
    ): Promise<AgentToolResultRequestV2> => {
      return Promise.resolve({
        protocolVersion: 2,
        runId: context.runId,
        threadId: context.threadId,
        toolCallId: call.id,
        clientToolResultId: TOOL_RESULT_ID,
        completedAt: '2026-07-16T00:00:00.000Z',
        ...(call.name === 'wallet.directory.query'
          ? { directorySession: call.directorySession, toolName: call.name }
          : { walletContextSession: call.walletContextSession, toolName: call.name }),
        status: 'rejected',
        error: {
          code: 'tool_unsupported',
          retryable: false,
        },
      });
    });
    const discard = jest.fn();
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift()!,
      wait: () => Promise.resolve(),
      toolExecutor: { execute, discard },
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Search for TON' },
    })).resolves.toMatchObject({ state: 'completed' });

    expect(runRequests).toHaveLength(2);
    expect(runRequests[1]).toMatchObject({ resumeAfterSequence: 1 });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(updates.filter((update: any) => update.kind === 'toolActivityChanged')).toEqual([
      expect.objectContaining({ toolCallId: TOOL_CALL_ID, status: 'running' }),
    ]);
    expect(toolResultRequests).toHaveLength(4);
    expect(toolResultRequests.every((request) => (
      JSON.stringify(request) === JSON.stringify(toolResultRequests[0])
    ))).toBe(true);
    expect(discard).not.toHaveBeenCalled();
  });

  it('discards an unacknowledged tool result after an invalid acknowledgement', async () => {
    const updates: unknown[] = [];
    const rawResultMarker = 'PRIVATE_WALLET_RESULT';
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.endsWith('/tool-results')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          runId: RUN_ID,
          toolCallId: TOOL_CALL_ID,
          clientToolResultId: '77777777-7777-4777-8777-777777777778',
          accepted: true,
          duplicate: false,
        }));
      }
      return Promise.resolve(ndjsonResponse([runStart(), toolCallEvent(2)]));
    }) as unknown as typeof fetch;
    const execute = jest.fn((
      call: AgentToolCall,
      context: AgentV2ToolExecutionContext,
    ): Promise<AgentToolResultRequestV2> => Promise.resolve({
      protocolVersion: 2,
      runId: context.runId,
      threadId: context.threadId,
      toolCallId: call.id,
      clientToolResultId: TOOL_RESULT_ID,
      completedAt: '2026-07-16T00:00:00.000Z',
      ...(call.name === 'wallet.directory.query'
        ? { directorySession: call.directorySession, toolName: call.name }
        : { walletContextSession: call.walletContextSession, toolName: call.name }),
      status: 'rejected',
      error: {
        code: 'tool_failed',
        retryable: false,
      },
    }));
    const discard = jest.fn();
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift()!,
      wait: () => Promise.resolve(),
      toolExecutor: { execute, discard },
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Search for TON' },
    })).resolves.toMatchObject({ state: 'failed' });

    expect(discard).toHaveBeenCalledTimes(1);
    expect(discard).toHaveBeenCalledWith(TOOL_CALL_ID);
    expect(JSON.stringify(updates)).not.toContain(rawResultMarker);
  });

  it('keeps independent threads streaming while another thread completes in the background', async () => {
    const storage = createMemoryStorage();
    await storage.setItem('agentV2DeviceIdentity', JSON.stringify({
      version: 1,
      deviceId: DEVICE_ID,
      deviceToken: `adt_v2.${'a'.repeat(43)}`,
      expiresAt: '2026-10-14T00:00:00.000Z',
    }));
    const firstStream = openNdjsonResponse([
      boundEvent(RUN_ID, {
        type: 'run_start', sequence: 1, clientRunId: CLIENT_RUN_ID, threadId: THREAD_ID, threadRevision: 1,
      }),
      boundEvent(RUN_ID, {
        type: 'message_start', sequence: 2, messageId: MESSAGE_ID, role: 'assistant', contentKind: 'markdown',
      }),
      boundEvent(RUN_ID, { type: 'text_delta', sequence: 3, messageId: MESSAGE_ID, delta: 'Still running' }),
    ]);
    const updates: any[] = [];
    let markFirstText!: () => void;
    const firstTextSeen = new Promise<void>((resolve) => {
      markFirstText = resolve;
    });
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      if (body.threadId === THREAD_ID) return Promise.resolve(firstStream.response);
      return Promise.resolve(ndjsonResponse([
        boundEvent(RUN_ID_2, {
          type: 'run_start', sequence: 1, clientRunId: CLIENT_RUN_ID_2, threadId: THREAD_ID_2, threadRevision: 1,
        }),
        boundEvent(RUN_ID_2, {
          type: 'message_start', sequence: 2, messageId: MESSAGE_ID_2, role: 'assistant', contentKind: 'markdown',
        }),
        boundEvent(RUN_ID_2, { type: 'text_delta', sequence: 3, messageId: MESSAGE_ID_2, delta: 'Done' }),
        boundEvent(RUN_ID_2, { type: 'message_end', sequence: 4, messageId: MESSAGE_ID_2, finishReason: 'complete' }),
      ]));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, CLIENT_RUN_ID_2, MESSAGE_ID_2];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => {
        updates.push(update);
        if (update.kind === 'textDelta' && update.clientRunId === CLIENT_RUN_ID) markFirstText();
      },
      randomUuid: () => ids.shift()!,
    });
    await runtime.acceptConsent();

    let firstSettled = false;
    const first = runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'First' },
    }).finally(() => {
      firstSettled = true;
    });
    const second = runtime.startRun({
      threadId: THREAD_ID_2,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Second' },
    });

    await firstTextSeen;
    await expect(second).resolves.toMatchObject({ clientRunId: CLIENT_RUN_ID_2, state: 'completed' });
    expect(firstSettled).toBe(false);
    firstStream.finish([
      boundEvent(RUN_ID, { type: 'message_end', sequence: 4, messageId: MESSAGE_ID, finishReason: 'complete' }),
    ]);
    await expect(first).resolves.toMatchObject({ clientRunId: CLIENT_RUN_ID, state: 'completed' });
    expect(updates.filter((update) => update.kind === 'textDelta')).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientRunId: CLIENT_RUN_ID, threadId: THREAD_ID, delta: 'Still running' }),
      expect.objectContaining({ clientRunId: CLIENT_RUN_ID_2, threadId: THREAD_ID_2, delta: 'Done' }),
    ]));
  });

  it('degrades an incompatible local host context to no-wallet and accepts recovery', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    let requestBody: any;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        requestBody = JSON.parse(init?.body as string);
        return Promise.resolve(ndjsonResponse([runStart(), messageStart(), messageEnd(3)]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      randomUuid: (() => {
        const values = [CLIENT_RUN_ID, MESSAGE_ID];
        return () => values.shift()!;
      })(),
      wait: () => Promise.resolve(),
      walletConversationContextCache: {
        clear: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        get: () => Promise.resolve(undefined),
        put: () => Promise.resolve(),
      },
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('ton'));

    await expect(runtime.updateHostContext({
      ...receiveHost('tron'),
      assetCatalog: [{ slug: 'invalid-asset', chain: 'tron', symbol: '', decimals: 6 }],
    })).resolves.toBe(true);
    await expect(runtime.startRun({
      expectedThreadRevision: 0,
      input: { kind: 'append', text: 'Explain staking' },
    })).resolves.toMatchObject({ state: 'completed' });

    expect(requestBody.walletContext).toEqual({ mode: 'none', reason: 'noWallet' });
    expect(requestBody.capabilities.supportedTools).toEqual([]);
    expect(requestBody.capabilities).toMatchObject({
      supportsFollowups: false,
      supportsInputContinuations: true,
    });
    expect(requestBody.capabilities.supportedEventTypes).not.toContain('followups');
    expect(requestBody.capabilities.supportedEventTypes).toContain('input_continuations');

    await expect(runtime.updateHostContext(receiveHost('tron'))).resolves.toBe(true);
    const internals = runtime as unknown as { walletSession: AgentV2WalletSession };
    expect(internals.walletSession.buildContext().walletContext).toMatchObject({
      mode: 'wallet',
      activeNetwork: 'tron',
    });
    await runtime.destroy();
  });

  it('keeps Receive valid across unrelated revisions and rejects relevant authority drift', async () => {
    const storage = createMemoryStorage();
    let requestBody: any;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        const body = JSON.parse(init?.body as string);
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: body.deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        requestBody = JSON.parse(init?.body as string);
        return Promise.resolve(ndjsonResponse([
          runStart(),
          messageStart(),
          event({
            type: 'action',
            sequence: 3,
            messageId: MESSAGE_ID,
            action: {
              id: '66666666-6666-4666-8666-666666666666',
              kind: 'receive',
              labelCode: 'open_receive',
              effect: 'open_receive',
              contextBinding: {
                sessionId: requestBody.walletContext.sessionId,
                revision: requestBody.walletContext.revision,
                activeAccountRef: requestBody.walletContext.activeAccount.accountRef,
                activeNetwork: 'ton',
              },
              localDraftRequired: false,
              requiresConfirmation: false,
            },
          }),
          threadEvent(4),
          messageEnd(5),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: () => {},
      wait: () => Promise.resolve(),
      walletConversationContextCache: {
        clear: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        get: () => Promise.resolve(undefined),
        put: () => Promise.resolve(),
      },
      randomUuid: (() => {
        const values = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
        return () => values.shift()!;
      })(),
    });
    await runtime.acceptConsent();
    const host = receiveHost('ton');
    await expect(runtime.updateHostContext(host)).resolves.toBe(true);
    await expect(runtime.updateHostContext({ ...host, theme: 'dark' })).resolves.toBe(false);
    await runtime.startRun({ expectedThreadRevision: 0, input: { kind: 'append', text: 'Receive' } });

    expect(runtime.resolveAction(MESSAGE_ID, '66666666-6666-4666-8666-666666666666')).toEqual({
      kind: 'openReceive', chain: 'ton',
    });
    await expect(runtime.updateHostContext({
      ...host,
      stakingOffers: stakeHost().stakingOffers,
    })).resolves.toBe(false);
    expect(runtime.resolveAction(MESSAGE_ID, '66666666-6666-4666-8666-666666666666')).toEqual({
      kind: 'openReceive', chain: 'ton',
    });
    await runtime.updateHostContext(receiveHost('tron'));
    expect(runtime.resolveAction(MESSAGE_ID, '66666666-6666-4666-8666-666666666666'))
      .toEqual({ kind: 'inactive' });
  });

  it('opens Staking only from a live action bound to the current local eligibility', async () => {
    const storage = createMemoryStorage();
    let requestBody: any;
    const actionId = '69696969-6969-4969-8969-696969696969';
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        const body = JSON.parse(init?.body as string);
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: body.deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        requestBody = JSON.parse(init?.body as string);
        return Promise.resolve(ndjsonResponse([
          runStart(),
          messageStart(),
          event({
            type: 'action',
            sequence: 3,
            messageId: MESSAGE_ID,
            action: {
              id: actionId,
              schemaVersion: 2,
              kind: 'stake',
              labelCode: 'open_staking',
              effect: 'open_staking',
              contextBinding: {
                sessionId: requestBody.walletContext.sessionId,
                revision: requestBody.walletContext.revision,
                activeAccountRef: requestBody.walletContext.activeAccount.accountRef,
              },
              productId: 'liquid',
              asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', decimals: 9 },
              amount: { kind: 'exact', value: '10' },
              localDraftRequired: false,
              requiresConfirmation: false,
            },
          }),
          threadEvent(4),
          messageEnd(5),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: () => {},
      wait: () => Promise.resolve(),
      randomUuid: (() => {
        const values = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
        return () => values.shift()!;
      })(),
    });
    await runtime.acceptConsent();
    const host = { ...stakeHost(), platform: 'ios' as const, client: 'native' as const };
    await expect(runtime.updateHostContext(host)).resolves.toBe(true);
    await runtime.startRun({ expectedThreadRevision: 0, input: { kind: 'append', text: 'Stake' } });

    expect(requestBody.capabilities.supportedActions).toContain('stake');
    expect(requestBody.walletContext.activeAccount.supportedActions).toContain('stake');
    expect(runtime.resolveAction(MESSAGE_ID, actionId)).toEqual({
      kind: 'openStaking',
      productId: 'liquid',
      tokenSlug: 'toncoin',
      amount: { kind: 'exact', value: '10' },
    });

    const refreshedHost = {
      ...host,
      stakingOffers: [{ ...host.stakingOffers[0], annualYield: '15' }],
    };
    await expect(runtime.updateHostContext(refreshedHost)).resolves.toBe(false);
    expect(runtime.resolveAction(MESSAGE_ID, actionId)).toEqual({
      kind: 'openStaking',
      productId: 'liquid',
      tokenSlug: 'toncoin',
      amount: { kind: 'exact', value: '10' },
    });

    await expect(runtime.updateHostContext({
      ...refreshedHost,
      platform: 'android',
    })).resolves.toBe(false);
    expect(runtime.resolveAction(MESSAGE_ID, actionId)).toEqual({ kind: 'inactive' });

    await expect(runtime.updateHostContext(refreshedHost)).resolves.toBe(false);

    const { stakingOffers: _stakingOffers, ...ineligibleHost } = refreshedHost;
    await expect(runtime.updateHostContext(ineligibleHost)).resolves.toBe(false);
    expect(runtime.resolveAction(MESSAGE_ID, actionId)).toEqual({ kind: 'inactive' });
  });

  it('revalidates current local staking eligibility for a hydrated action', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const walletSession = new AgentV2WalletSession();
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/messages?')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          threadId: THREAD_ID,
          messages: [{
            id: MESSAGE_ID,
            threadId: THREAD_ID,
            role: 'assistant',
            status: 'complete',
            content: { kind: 'markdown', text: 'Open Staking' },
            createdAt: '2026-08-13T12:00:00.000Z',
            actions: [{
              id: TOOL_CALL_ID,
              schemaVersion: 2,
              kind: 'stake',
              labelCode: 'open_staking',
              effect: 'open_staking',
              productId: 'liquid',
              asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', decimals: 9 },
              amount: { kind: 'all' },
              localDraftRequired: false,
              requiresConfirmation: false,
            }],
          }],
        }));
      }
      if (url.endsWith(`/threads/${THREAD_ID}`)) {
        return Promise.resolve(jsonResponse({ protocolVersion: 2, thread: threadSummary() }));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      walletSession,
    });
    await runtime.acceptConsent();
    const host = stakeHost();
    await runtime.updateHostContext(host);
    await runtime.getMessages(THREAD_ID);

    expect(runtime.resolveAction(MESSAGE_ID, TOOL_CALL_ID)).toEqual({
      kind: 'openStaking',
      productId: 'liquid',
      tokenSlug: 'toncoin',
      amount: { kind: 'all' },
    });

    await runtime.updateHostContext({
      ...host,
      stakingOffers: [{ ...host.stakingOffers[0], productId: 'ethena' }],
    });
    expect(runtime.resolveAction(MESSAGE_ID, TOOL_CALL_ID)).toEqual({ kind: 'inactive' });

    const { stakingOffers: _stakingOffers, ...ineligibleHost } = host;
    await runtime.updateHostContext(ineligibleHost);
    expect(runtime.resolveAction(MESSAGE_ID, TOOL_CALL_ID)).toEqual({ kind: 'inactive' });
  });

  it('opens targeted Receive V3 on an inactive account-supported network', async () => {
    const storage = createMemoryStorage();
    let requestBody: any;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        const body = JSON.parse(init?.body as string);
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: body.deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        requestBody = JSON.parse(init?.body as string);
        return Promise.resolve(ndjsonResponse([
          runStart(),
          messageStart(),
          event({
            type: 'action',
            sequence: 3,
            messageId: MESSAGE_ID,
            action: {
              id: '67676767-6767-4767-8767-676767676767',
              schemaVersion: 3,
              kind: 'receive',
              labelCode: 'open_receive',
              effect: 'open_receive',
              contextBinding: {
                sessionId: requestBody.walletContext.sessionId,
                revision: requestBody.walletContext.revision,
                activeAccountRef: requestBody.walletContext.activeAccount.accountRef,
                activeNetwork: 'tron',
              },
              targetNetwork: 'ton',
              localDraftRequired: false,
              requiresConfirmation: false,
            },
          }),
          event({
            type: 'action',
            sequence: 4,
            messageId: MESSAGE_ID,
            action: {
              id: '68686868-6868-4868-8868-686868686868',
              schemaVersion: 3,
              kind: 'receive',
              labelCode: 'open_receive',
              effect: 'open_receive',
              contextBinding: {
                sessionId: requestBody.walletContext.sessionId,
                revision: requestBody.walletContext.revision,
                activeAccountRef: requestBody.walletContext.activeAccount.accountRef,
                activeNetwork: 'tron',
              },
              targetNetwork: 'bitcoin',
              localDraftRequired: false,
              requiresConfirmation: false,
            },
          }),
          threadEvent(5),
          messageEnd(6),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: () => {},
      wait: () => Promise.resolve(),
      walletConversationContextCache: {
        clear: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        get: () => Promise.resolve(undefined),
        put: () => Promise.resolve(),
      },
      randomUuid: (() => {
        const values = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
        return () => values.shift()!;
      })(),
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('tron', false));
    await runtime.startRun({ expectedThreadRevision: 0, input: { kind: 'append', text: 'Receive GRAM' } });

    expect(requestBody.capabilities.receiveActionVersion).toBe(3);
    expect(runtime.resolveAction(MESSAGE_ID, '67676767-6767-4767-8767-676767676767')).toEqual({
      kind: 'openReceive', chain: 'ton',
    });
    expect(runtime.resolveAction(MESSAGE_ID, '68686868-6868-4868-8868-686868686868'))
      .toEqual({ kind: 'inactive' });
  });

  it('preserves a targeted Receive network through message hydration', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const walletSession = new AgentV2WalletSession();
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/messages?')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          threadId: THREAD_ID,
          messages: [{
            id: MESSAGE_ID,
            threadId: THREAD_ID,
            role: 'assistant',
            status: 'complete',
            content: { kind: 'markdown', text: 'Receive on TRON' },
            createdAt: '2026-08-13T12:00:00.000Z',
            actions: [{
              id: TOOL_CALL_ID,
              schemaVersion: 3,
              kind: 'receive',
              labelCode: 'open_receive',
              effect: 'open_receive',
              targetNetwork: 'tron',
              localDraftRequired: false,
              requiresConfirmation: false,
            }],
          }],
        }));
      }
      if (url.endsWith(`/threads/${THREAD_ID}`)) {
        return Promise.resolve(jsonResponse({ protocolVersion: 2, thread: threadSummary() }));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      walletSession,
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('ton', false));

    await runtime.getMessages(THREAD_ID);

    expect(runtime.resolveAction(MESSAGE_ID, TOOL_CALL_ID)).toEqual({
      kind: 'openReceive', chain: 'tron',
    });
    expect(walletSession.snapshot().host?.activeNetwork).toBe('ton');

    await runtime.updateHostContext(receiveHost('ton'));
    expect(runtime.resolveAction(MESSAGE_ID, TOOL_CALL_ID)).toEqual({ kind: 'inactive' });
  });

  it('bounds retained actions and wallet conversation threads with their exact TTLs', () => {
    let now = 0;
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: jest.fn() as unknown as typeof fetch,
      onUpdate: jest.fn(),
      now: () => now,
      walletConversationContextCache: undefined,
    });
    const internals = runtime as unknown as {
      actions: { set: (namespace: string, key: string, value: unknown) => number; size: number };
      walletConversationContexts: {
        set: (namespace: string, key: string, value: unknown) => number;
        size: number;
      };
    };

    for (let index = 0; index < 513; index++) {
      internals.actions.set(index % 2 ? 'live' : 'persisted', String(index), { index });
    }
    for (let index = 0; index < 33; index++) {
      internals.walletConversationContexts.set('context', String(index), {
        schemaVersion: 5,
        sourceAssistantMessageId: String(index),
        sessionId: 'session',
        revision: 1,
        operation: 'account.inventory',
        query: {
          schemaVersion: 5,
          operation: 'account.inventory',
          accountSelector: { kind: 'current' },
          chains: [],
        },
        scopeChoices: [],
        expiresAt: new Date(60 * 60_000).toISOString(),
      });
    }

    expect(internals.actions.size).toBe(512);
    expect(internals.walletConversationContexts.size).toBe(32);

    now = 30 * 60_000;
    expect(internals.walletConversationContexts.size).toBe(0);
    expect(internals.actions.size).toBe(512);

    now = 24 * 60 * 60_000;
    expect(internals.actions.size).toBe(0);
  });

  it('invalidates thread-bound local actions before edit or regenerate admission', async () => {
    const clear = jest.fn();
    const updates: any[] = [];
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      return Promise.resolve(ndjsonResponse([
        runStart(),
        messageStart(),
        messageEnd(3),
      ]));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: (() => {
        const values = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
        return () => values.shift()!;
      })(),
      toolExecutor: {
        execute: jest.fn(),
        discard: jest.fn(),
        clear,
      },
    });
    await runtime.acceptConsent();

    await runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'edit', targetUserMessageId: MESSAGE_ID_2, text: 'Edited' },
    });

    expect(clear).toHaveBeenCalledWith(THREAD_ID);
    expect(updates).toContainEqual({ kind: 'walletAuthorityChanged', threadId: THREAD_ID });
  });

  it('establishes the local authority barrier before remote cancellation settles', async () => {
    let resolveCancel!: () => void;
    const cancelPending = new Promise<void>((resolve) => {
      resolveCancel = resolve;
    });
    const discard = jest.fn();
    const clear = jest.fn();
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: jest.fn() as unknown as typeof fetch,
      onUpdate: jest.fn(),
      toolExecutor: {
        execute: jest.fn(),
        discard,
        clear,
      },
      walletConversationContextCache: {
        clear: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        get: () => Promise.resolve(undefined),
        put: () => Promise.resolve(),
      },
    });
    const host = receiveHost('ton');
    await runtime.updateHostContext({
      ...host,
      accounts: [...host.accounts, {
        ...host.accounts[0],
        accountId: 'secondary-account',
        addresses: { ton: 'EQ-secondary-address' },
      }],
    });
    clear.mockClear();

    const controller = new AbortController();
    const pendingToolCallIds = new Set([TOOL_CALL_ID]);
    const pendingToolResults = new Map([
      [TOOL_CALL_ID, { toolCallId: TOOL_CALL_ID } as AgentToolResultRequestV2],
    ]);
    const internals = runtime as unknown as {
      cancelRunRemotely: (runId: string) => Promise<void>;
      runs: Map<string, {
        binding: { runId: string };
        controller: AbortController;
        pendingToolCallIds: Set<string>;
        pendingToolResults: Map<string, AgentToolResultRequestV2>;
      }>;
    };
    const cancelRunRemotely = jest.fn(() => cancelPending);
    internals.cancelRunRemotely = cancelRunRemotely;
    internals.runs.set(CLIENT_RUN_ID, {
      binding: { runId: RUN_ID },
      controller,
      pendingToolCallIds,
      pendingToolResults,
    });

    await runtime.updateHostContext({
      ...host,
      accounts: host.accounts.map((account) => (
        account.accountId === host.activeAccountId
          ? { ...account, addresses: { ...account.addresses, ton: 'EQ-new-active-address' } }
          : account
      )),
    });

    expect(controller.signal.aborted).toBe(true);
    expect(pendingToolCallIds.size).toBe(0);
    expect(pendingToolResults.size).toBe(0);
    expect(discard).toHaveBeenCalledWith(TOOL_CALL_ID);
    expect(cancelRunRemotely).toHaveBeenCalledWith(RUN_ID);
    expect(clear).toHaveBeenCalledWith(undefined, { shouldRetainRevalidatedActions: true });

    resolveCancel();
    await Promise.resolve();
  });

  it.each(['direct', 'background'] as const)(
    'applies the authoritative thread returned by %s cancellation',
    async (cancellationKind) => {
      const storage = createMemoryStorage();
      await storeIdentity(storage);
      const thread = threadSummary({ revision: 3, messageCount: 2 });
      const updates: AgentV2ClientUpdate[] = [];
      const fetchMock = jest.fn(() => Promise.resolve(jsonResponse({
        protocolVersion: 2,
        runId: RUN_ID,
        state: 'cancelled',
        lastSequence: 5,
        thread,
      }))) as unknown as typeof fetch;
      const runtime = new AgentV2Runtime({
        storage,
        baseUrl: 'https://agent.test/api/v2',
        fetch: fetchMock,
        onUpdate: (update) => updates.push(update),
        randomUuid: () => CLIENT_RUN_ID,
      });

      if (cancellationKind === 'direct') {
        await expect(runtime.cancelRun(RUN_ID)).resolves.toMatchObject({ thread });
      } else {
        const internals = runtime as unknown as {
          cancelRunRemotely: (runId: string) => Promise<void>;
        };
        await internals.cancelRunRemotely(RUN_ID);
      }

      expect(updates).toEqual([{ kind: 'threadChanged', threadId: THREAD_ID, thread }]);
      await runtime.destroy();
    },
  );

  it('ignores late stream output after an authority change without waiting for remote cancellation', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const updates: AgentV2ClientUpdate[] = [];
    const registerAction = jest.fn();
    let markThreadChanged!: () => void;
    const threadChanged = new Promise<void>((resolve) => {
      markThreadChanged = resolve;
    });
    let resolveCancel!: () => void;
    const cancelPending = new Promise<void>((resolve) => {
      resolveCancel = resolve;
    });
    const stream = openNdjsonResponse([
      runStart(),
      messageStart(),
      actionEvent(3),
      threadEvent(4),
    ]);
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) return Promise.resolve(stream.response);
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => {
        updates.push(update);
        if (update.kind === 'threadChanged') markThreadChanged();
      },
      randomUuid: () => ids.shift() ?? DEVICE_ID,
      toolExecutor: {
        execute: jest.fn(),
        discard: jest.fn(),
        registerAction,
      },
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('ton'));
    const internals = runtime as unknown as {
      cancelRunRemotely: (runId: string) => Promise<void>;
    };
    const cancelRunRemotely = jest.fn(() => cancelPending);
    internals.cancelRunRemotely = cancelRunRemotely;

    const run = runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Receive' },
    });
    await threadChanged;
    const updatesBeforeSwitch = updates.length;

    await expect(runtime.updateHostContext(receiveHost('tron'))).resolves.toBe(true);
    expect(cancelRunRemotely).toHaveBeenCalledWith(RUN_ID);
    stream.finish([messageEnd(5)]);

    await expect(run).resolves.toMatchObject({ state: 'cancelled', inputMessageId: MESSAGE_ID });
    expect(registerAction).not.toHaveBeenCalled();
    expect(updates.slice(updatesBeforeSwitch).map(({ kind }) => kind)).toEqual([
      'walletAuthorityChanged',
    ]);

    resolveCancel();
    await Promise.resolve();
  });

  it('continues an active run when the local swap policy changes', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const updates: AgentV2ClientUpdate[] = [];
    let markThreadChanged!: () => void;
    const threadChanged = new Promise<void>((resolve) => {
      markThreadChanged = resolve;
    });
    const stream = openNdjsonResponse([
      runStart(),
      messageStart(),
      threadEvent(3),
    ]);
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) return Promise.resolve(stream.response);
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => {
        updates.push(update);
        if (update.kind === 'threadChanged') markThreadChanged();
      },
      randomUuid: (() => {
        const values = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
        return () => values.shift()!;
      })(),
    });
    await runtime.acceptConsent();
    const host = {
      ...receiveHost('ton', false),
      isTestnet: false,
      swapAssetCatalog: [
        { slug: 'toncoin', chain: 'ton' as const, symbol: 'TON', decimals: 9 },
        { slug: 'usdton', chain: 'ton' as const, symbol: 'USDT', decimals: 6 },
      ],
    };
    await runtime.updateHostContext(host);

    const run = runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Explain swaps' },
    });
    await threadChanged;
    const updatesBeforeRefresh = updates.length;

    await expect(runtime.updateHostContext({
      ...host,
      swapAssetCatalog: host.swapAssetCatalog.slice(0, 1),
    })).resolves.toBe(false);
    stream.finish([textDelta('Answer', 4), messageContentEnd(5), messageEnd(6)]);

    await expect(run).resolves.toMatchObject({ state: 'completed' });
    expect(updates.slice(updatesBeforeRefresh)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'textDelta', delta: 'Answer' }),
      expect.objectContaining({ kind: 'messageContentEnded', messageId: MESSAGE_ID }),
      expect.objectContaining({ kind: 'messageCompleted' }),
    ]));
    expect(updates.findIndex(({ kind }) => kind === 'messageContentEnded'))
      .toBeLessThan(updates.findIndex(({ kind }) => kind === 'messageCompleted'));
  });

  it('retains a revalidated Send action after an unrelated wallet-profile update', async () => {
    const action = persistedSendAction();
    const resolved = {
      kind: 'reviewSend' as const,
      draftId: action.draftId,
      chain: 'ton',
      review: {
        tokenSlug: 'toncoin',
        amountAtomic: '500000000',
        toAddress: 'EQ-mom-private',
      },
    };
    const clear = jest.fn();
    const onUpdate = jest.fn();
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: jest.fn() as unknown as typeof fetch,
      onUpdate,
      toolExecutor: {
        execute: jest.fn(),
        discard: jest.fn(),
        clear,
        resolvePersistedAction: () => resolved,
      },
    });
    const host: AgentV2HostContextSnapshot = receiveHost('ton');
    host.accounts.push({
      ...host.accounts[0],
      accountId: 'secondary-account',
      label: 'Savings',
      addresses: { ...host.accounts[0].addresses, ton: 'EQ-secondary-address' },
    });
    await runtime.updateHostContext(host);
    const internals = runtime as unknown as {
      actions: {
        set: (
          namespace: string,
          key: string,
          value: unknown,
          options: { threadId: string },
        ) => number;
      };
    };
    internals.actions.set('persisted', `${MESSAGE_ID}:${action.id}`, {
      messageId: MESSAGE_ID,
      threadId: THREAD_ID,
      action,
    }, { threadId: THREAD_ID });
    clear.mockClear();
    onUpdate.mockClear();

    await expect(runtime.updateHostContext({
      ...host,
      accounts: host.accounts.map((account) => (
        account.accountId === 'secondary-account' ? { ...account, label: 'Cold Savings' } : account
      )),
    })).resolves.toBe(false);

    expect(runtime.resolveAction(MESSAGE_ID, action.id)).toEqual(resolved);
    expect(clear).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith({ kind: 'walletContextChanged' });
  });

  it('removes a stale wallet conversation cache write after an authority change', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    let resolvePut!: () => void;
    let markPutStarted!: () => void;
    const putStarted = new Promise<void>((resolve) => {
      markPutStarted = resolve;
    });
    const putPending = new Promise<void>((resolve) => {
      resolvePut = resolve;
    });
    const deleteContext = jest.fn(() => Promise.resolve());
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: jest.fn() as unknown as typeof fetch,
      onUpdate: jest.fn(),
      walletConversationContextCache: {
        clear: () => Promise.resolve(),
        delete: deleteContext,
        get: () => Promise.resolve(undefined),
        put: () => {
          markPutStarted();
          return putPending;
        },
      },
    });
    await runtime.updateHostContext(receiveHost('ton'));
    const internals = runtime as unknown as {
      authorityGeneration: number;
      cacheWalletConversationContext: (
        threadId: string,
        messageId: string,
        context: AgentWalletConversationContextV5,
        authorityGeneration: number,
      ) => Promise<boolean>;
      walletSession: AgentV2WalletSession;
    };
    const authority = internals.walletSession.snapshot();
    const generation = internals.authorityGeneration;
    const context = walletConversationContextV5(authority.sessionId, authority.revision);

    const cacheWrite = internals.cacheWalletConversationContext(
      THREAD_ID,
      MESSAGE_ID,
      context,
      generation,
    );
    await putStarted;
    await runtime.updateHostContext(receiveHost('tron'));
    resolvePut();

    await expect(cacheWrite).resolves.toBe(false);
    expect(deleteContext).toHaveBeenCalledWith(expect.objectContaining({
      threadId: THREAD_ID,
      messageId: MESSAGE_ID,
    }));
  });

  it('removes a stale cache read after an authority change without restoring local controls', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    let resolveGet!: (context: AgentWalletConversationContextV5) => void;
    let markGetStarted!: () => void;
    const getStarted = new Promise<void>((resolve) => {
      markGetStarted = resolve;
    });
    const getPending = new Promise<AgentWalletConversationContextV5>((resolve) => {
      resolveGet = resolve;
    });
    const deleteContext = jest.fn(() => Promise.resolve());
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: jest.fn() as unknown as typeof fetch,
      onUpdate: jest.fn(),
      walletConversationContextCache: {
        clear: () => Promise.resolve(),
        delete: deleteContext,
        get: () => {
          markGetStarted();
          return getPending;
        },
        put: () => Promise.resolve(),
      },
    });
    await runtime.updateHostContext(receiveHost('ton'));
    const internals = runtime as unknown as {
      authorityGeneration: number;
      hydrateWalletConversationContexts: (
        threadId: string,
        messages: AgentV2HydratedMessage[],
        authorityGeneration: number,
      ) => Promise<AgentV2HydratedMessage[]>;
      walletConversationContexts: Map<string, unknown>;
      walletSession: AgentV2WalletSession;
    };
    const authority = internals.walletSession.snapshot();
    const context = walletConversationContextV5(authority.sessionId, authority.revision);
    const messages: AgentV2HydratedMessage[] = [{
      id: MESSAGE_ID,
      threadId: THREAD_ID,
      role: 'assistant',
      status: 'complete',
      content: { kind: 'semantic', content: { kind: 'notice', schemaVersion: 1, code: 'empty_result' } },
      createdAt: '2026-08-11T12:00:00.000Z',
    }];

    const hydration = internals.hydrateWalletConversationContexts(
      THREAD_ID,
      messages,
      internals.authorityGeneration,
    );
    await getStarted;
    await runtime.updateHostContext(receiveHost('tron'));
    resolveGet(context);

    await expect(hydration).resolves.toEqual(messages);
    expect(internals.walletConversationContexts.size).toBe(0);
    expect(deleteContext).toHaveBeenCalledWith(expect.objectContaining({
      threadId: THREAD_ID,
      messageId: MESSAGE_ID,
    }));
  });

  it('does not delete a new-authority cache binding resolved by a stale replacement', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const deleteContext = jest.fn(() => Promise.resolve());
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: jest.fn() as unknown as typeof fetch,
      onUpdate: jest.fn(),
      walletConversationContextCache: {
        clear: () => Promise.resolve(),
        delete: deleteContext,
        get: () => Promise.resolve(undefined),
        put: () => Promise.resolve(),
      },
    });
    await runtime.updateHostContext(receiveHost('ton'));
    let resolveBinding!: (binding: AgentV2WalletContextCacheBinding) => void;
    let markBindingStarted!: () => void;
    const bindingStarted = new Promise<void>((resolve) => {
      markBindingStarted = resolve;
    });
    const bindingPending = new Promise<AgentV2WalletContextCacheBinding>((resolve) => {
      resolveBinding = resolve;
    });
    const internals = runtime as unknown as {
      authorityGeneration: number;
      rememberWalletConversationContext: (
        threadId: string,
        messageId: string,
        context: AgentWalletConversationContextV5,
      ) => void;
      replaceWalletConversationContext: (
        threadId: string,
        messageId: string,
        context: AgentWalletConversationContextV5,
        authorityGeneration: number,
      ) => Promise<boolean>;
      walletContextBinding: (
        threadId: string,
        messageId: string,
      ) => Promise<AgentV2WalletContextCacheBinding>;
      walletSession: AgentV2WalletSession;
    };
    const oldAuthority = internals.walletSession.snapshot();
    const oldContext = walletConversationContextV5(oldAuthority.sessionId, oldAuthority.revision);
    internals.rememberWalletConversationContext(THREAD_ID, MESSAGE_ID, oldContext);
    const generation = internals.authorityGeneration;
    internals.walletContextBinding = () => {
      markBindingStarted();
      return bindingPending;
    };
    const replacement = internals.replaceWalletConversationContext(
      THREAD_ID,
      MESSAGE_ID_2,
      { ...oldContext, sourceAssistantMessageId: MESSAGE_ID_2 },
      generation,
    );
    await bindingStarted;
    await runtime.updateHostContext(receiveHost('tron'));
    const newAuthority = internals.walletSession.snapshot();
    resolveBinding({
      accountDigest: 'new-account-digest',
      profileDigest: 'new-profile-digest',
      deviceId: DEVICE_ID,
      messageId: MESSAGE_ID,
      revision: newAuthority.revision,
      sessionId: newAuthority.sessionId,
      threadId: THREAD_ID,
    });

    await expect(replacement).resolves.toBe(false);
    expect(deleteContext).not.toHaveBeenCalled();
  });

  it('rejects delayed message hydration before it restores persisted actions after authority change', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    let resolveMessages!: (response: Response) => void;
    let markMessagesRequested!: () => void;
    const messagesRequested = new Promise<void>((resolve) => {
      markMessagesRequested = resolve;
    });
    const messagesPending = new Promise<Response>((resolve) => {
      resolveMessages = resolve;
    });
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/messages?')) {
        markMessagesRequested();
        return messagesPending;
      }
      if (url.endsWith(`/threads/${THREAD_ID}`)) {
        return Promise.resolve(jsonResponse({ protocolVersion: 2, thread: threadSummary() }));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('ton'));

    const hydration = runtime.getMessages(THREAD_ID);
    await messagesRequested;
    await runtime.updateHostContext(receiveHost('tron'));
    resolveMessages(jsonResponse({
      protocolVersion: 2,
      threadId: THREAD_ID,
      messages: [{
        id: MESSAGE_ID,
        threadId: THREAD_ID,
        role: 'assistant',
        status: 'complete',
        content: { kind: 'markdown', text: 'Receive' },
        createdAt: '2026-08-11T12:00:00.000Z',
        actions: [{
          id: TOOL_CALL_ID,
          kind: 'receive',
          labelCode: 'open_receive',
          effect: 'open_receive',
          localDraftRequired: false,
          requiresConfirmation: false,
        }],
      }],
    }));

    await expect(hydration).rejects.toMatchObject({ code: 'wallet_context_changed' });
    expect(runtime.resolveAction(MESSAGE_ID, TOOL_CALL_ID)).toEqual({ kind: 'inactive' });
  });

  it('does not commit staged persisted actions when authority changes during local hydration', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    let finishHydration!: () => void;
    let markHydrationStarted!: () => void;
    const hydrationStarted = new Promise<void>((resolve) => {
      markHydrationStarted = resolve;
    });
    const hydrationPending = new Promise<void>((resolve) => {
      finishHydration = resolve;
    });
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/messages?')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          threadId: THREAD_ID,
          messages: [{
            id: MESSAGE_ID,
            threadId: THREAD_ID,
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-08-11T12:00:00.000Z',
            actions: [{
              id: TOOL_CALL_ID,
              kind: 'receive',
              labelCode: 'open_receive',
              effect: 'open_receive',
              localDraftRequired: false,
              requiresConfirmation: false,
            }],
          }],
        }));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
    });
    runtime.setToolExecutor({
      execute: () => Promise.reject(new Error('Not used')),
      discard: () => {},
      hydrateAction: () => {
        markHydrationStarted();
        return hydrationPending;
      },
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('ton'));

    const hydration = runtime.getMessages(THREAD_ID);
    await hydrationStarted;
    await runtime.updateHostContext(receiveHost('tron'));
    finishHydration();

    await expect(hydration).rejects.toMatchObject({ code: 'wallet_context_changed' });
    expect(runtime.resolveAction(MESSAGE_ID, TOOL_CALL_ID)).toEqual({ kind: 'inactive' });
  });

  it('hydrates executable V3 navigation targets while keeping legacy rows inactive', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const persistedActions = navigationActionFixture.projectionCases
      .map(({ expectedPersisted }) => expectedPersisted);
    const robinhoodTargets = [
      {
        id: '10000000-0000-4000-8000-000000000006',
        schemaVersion: 3,
        kind: 'openToken',
        labelCode: 'open_token',
        slug: 'robinhood',
        chain: 'robinhood',
        requiresConfirmation: true,
      },
      {
        id: '10000000-0000-4000-8000-000000000007',
        schemaVersion: 3,
        kind: 'openTransaction',
        labelCode: 'open_transaction',
        chain: 'robinhood',
        transactionRef: 'transaction-2',
        requiresConfirmation: true,
      },
      {
        id: '10000000-0000-4000-8000-000000000008',
        schemaVersion: 3,
        kind: 'openAgent',
        labelCode: 'open_agent',
        entryPoint: {
          kind: 'portfolioChart',
          chartId: 'net-worth',
          range: '3m',
          datasetFocus: { chain: 'robinhood' },
        },
        requiresConfirmation: true,
      },
    ] as const;
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/messages?')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          threadId: THREAD_ID,
          messages: [
            {
              id: MESSAGE_ID,
              threadId: THREAD_ID,
              role: 'assistant',
              status: 'complete',
              content: { kind: 'markdown', text: 'Open' },
              createdAt: '2026-08-11T12:00:00.000Z',
              actions: [...persistedActions, ...robinhoodTargets],
            },
            {
              id: MESSAGE_ID_2,
              threadId: THREAD_ID,
              role: 'assistant',
              status: 'complete',
              content: { kind: 'markdown', text: 'Legacy' },
              createdAt: '2026-08-11T11:00:00.000Z',
              actions: navigationActionFixture.legacyReadCases,
            },
          ],
        }));
      }
      if (url.endsWith(`/threads/${THREAD_ID}`)) {
        return Promise.resolve(jsonResponse({ protocolVersion: 2, thread: threadSummary() }));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
    });
    await runtime.acceptConsent();
    const host: AgentV2HostContextSnapshot = {
      ...receiveHost('ton'),
      isTestnet: false,
      assetCatalog: [
        { slug: 'toncoin', chain: 'ton', symbol: 'TON', decimals: 9 },
        {
          slug: 'tether',
          chain: 'ton',
          tokenAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
          symbol: 'USD₮',
          decimals: 6,
        },
        { slug: 'robinhood', chain: 'robinhood', symbol: 'HOOD', decimals: 18 },
      ],
    };
    await runtime.updateHostContext(host);

    await runtime.getMessages(THREAD_ID);

    expect(persistedActions.map(({ id }) => runtime.resolveAction(MESSAGE_ID, id))).toEqual([
      { kind: 'openUrl', url: 'https://example.com/help' },
      { kind: 'openToken', slug: 'toncoin', chain: 'ton' },
      {
        kind: 'openToken',
        slug: 'tether',
        chain: 'ton',
        tokenAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
      },
      { kind: 'openTransaction', chain: 'ton', transactionRef: 'transaction-1' },
      { kind: 'openAgent', entryPoint: { kind: 'agentTab' } },
    ]);
    expect(robinhoodTargets.map(({ id }) => runtime.resolveAction(MESSAGE_ID, id))).toEqual([
      { kind: 'openToken', slug: 'robinhood', chain: 'robinhood' },
      { kind: 'openTransaction', chain: 'robinhood', transactionRef: 'transaction-2' },
      {
        kind: 'openAgent',
        entryPoint: {
          kind: 'portfolioChart',
          chartId: 'net-worth',
          range: '3m',
          datasetFocus: { chain: 'robinhood' },
        },
      },
    ]);
    navigationActionFixture.legacyReadCases.forEach(({ id }) => {
      expect(runtime.resolveAction(MESSAGE_ID_2, id)).toEqual({ kind: 'inactive' });
    });

    await runtime.updateHostContext({
      ...host,
      swapAssetCatalog: [
        { slug: 'toncoin', chain: 'ton', symbol: 'TON', decimals: 9 },
        { slug: 'usdton', chain: 'ton', symbol: 'USDT', decimals: 6 },
      ],
    });
    expect(runtime.resolveAction(MESSAGE_ID, persistedActions[0].id)).toEqual({
      kind: 'openUrl', url: 'https://example.com/help',
    });
  });

  it('rejects retry admission when wallet authority changes during capability setup', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const runRequests: unknown[] = [];
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        runRequests.push(JSON.parse(init?.body as string));
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          error: {
            code: 'rate_limited',
            retryable: true,
            retryAfterMs: 5_000,
          },
        }, 429));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID];
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      randomUuid: () => ids.shift() ?? DEVICE_ID,
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('ton'));
    await runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Retry me' },
    });

    let resolveCapabilities!: () => void;
    let markCapabilitiesStarted!: () => void;
    const capabilitiesStarted = new Promise<void>((resolve) => {
      markCapabilitiesStarted = resolve;
    });
    const capabilitiesPending = new Promise<void>((resolve) => {
      resolveCapabilities = resolve;
    });
    const internals = runtime as unknown as {
      ensureServerCapabilities: () => Promise<void>;
    };
    internals.ensureServerCapabilities = () => {
      markCapabilitiesStarted();
      return capabilitiesPending;
    };

    const retry = runtime.retryRun(CLIENT_RUN_ID);
    await capabilitiesStarted;
    await runtime.updateHostContext(receiveHost('tron'));
    resolveCapabilities();

    await expect(retry).rejects.toMatchObject({
      code: 'wallet_context_changed',
      retryable: false,
    });
    expect(runRequests).toHaveLength(1);
  });

  it('bounds best-effort remote cancellation to three seconds', async () => {
    jest.useFakeTimers();
    try {
      const storage = createMemoryStorage();
      await storeIdentity(storage);
      const fetchMock = jest.fn((_input: string | URL | Request, init?: RequestInit) => (
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        })
      )) as unknown as typeof fetch;
      const runtime = new AgentV2Runtime({
        storage,
        baseUrl: 'https://agent.test/api/v2',
        fetch: fetchMock,
        onUpdate: jest.fn(),
      });
      const internals = runtime as unknown as {
        cancelRunRemotely: (runId: string) => Promise<void>;
      };

      const cancellation = internals.cancelRunRemotely(RUN_ID);
      const cancellationExpectation = expect(cancellation).rejects.toMatchObject({ name: 'TimeoutError' });
      await jest.advanceTimersByTimeAsync(3_000);

      await cancellationExpectation;
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await runtime.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('attaches a live wallet choice context to its exact selection message', async () => {
    const now = Date.parse('2026-08-02T12:00:00.000Z');
    let requestBody: any;
    let runRequestCount = 0;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/capabilities')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          portfolioPositions: 'available',
          walletQuery: 'available',
        }));
      }
      if (url.endsWith('/runs')) {
        runRequestCount += 1;
        requestBody = JSON.parse(init?.body as string);
        return Promise.resolve(ndjsonResponse([runStart(), messageStart(), messageEnd(3)]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: () => {},
      now: () => now,
      randomUuid: (() => {
        const values = [
          CLIENT_RUN_ID,
          MESSAGE_ID,
          DEVICE_ID,
          CLIENT_RUN_ID_2,
          '55555555-5555-4555-8555-555555555557',
        ];
        return () => values.shift()!;
      })(),
      walletConversationContextCache: {
        clear: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        get: () => Promise.resolve(undefined),
        put: () => Promise.resolve(),
      },
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('ton'));
    const wallet = (runtime as any).walletSession.snapshot();
    const conversationContext = {
      schemaVersion: 5,
      sourceAssistantMessageId: MESSAGE_ID_2,
      sessionId: wallet.sessionId,
      revision: wallet.revision,
      operation: 'account.inventory',
      query: {
        schemaVersion: 5,
        operation: 'account.inventory',
        accountSelector: { kind: 'named', label: 'Savings' },
        chains: ['ton'],
      },
      scopeChoices: [{
        choiceId: `choice_${'b'.repeat(32)}`,
        scopeAnchor: `scope_${'c'.repeat(32)}`,
        label: 'Savings',
        ordinal: 1,
        chains: ['ton'],
      }],
      expiresAt: '2026-08-02T12:15:00.000Z',
    } as const;
    (runtime as any).rememberWalletConversationContext(THREAD_ID, MESSAGE_ID_2, conversationContext);

    await runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Savings' },
      walletScopeSelectionOf: {
        sourceAssistantMessageId: MESSAGE_ID_2,
        choiceId: `choice_${'b'.repeat(32)}`,
      },
    });

    expect(requestBody.walletConversationContext).toEqual(conversationContext);
    expect(requestBody.walletScopeSelectionOf).toEqual({
      sourceAssistantMessageId: MESSAGE_ID_2,
      choiceId: `choice_${'b'.repeat(32)}`,
    });
    const completedRunRequests = runRequestCount;
    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Savings' },
      walletScopeSelectionOf: {
        sourceAssistantMessageId: MESSAGE_ID,
        choiceId: `choice_${'b'.repeat(32)}`,
      },
    })).rejects.toMatchObject({ code: 'wallet_context_changed' });
    expect(runRequestCount).toBe(completedRunRequests);
  });

  it('emits TTL-bound controls from an authority-matched message_end V5 context', async () => {
    const now = Date.parse('2026-08-05T12:00:00.000Z');
    const updates: any[] = [];
    const put = jest.fn((
      _binding: AgentV2WalletContextCacheBinding,
      _context: AgentWalletConversationContextV5,
    ) => Promise.resolve());
    const walletSession = new AgentV2WalletSession();
    walletSession.update(receiveHost('ton'));
    const authority = walletSession.snapshot();
    const conversationContext = walletConversationContextV5(authority.sessionId, authority.revision);
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/capabilities')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          portfolioPositions: 'disabled',
          walletQuery: 'disabled',
        }));
      }
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([
          runStart(),
          event({
            type: 'message_start',
            sequence: 2,
            messageId: MESSAGE_ID,
            role: 'assistant',
            contentKind: 'semantic',
          }),
          event({
            type: 'message_end',
            sequence: 3,
            messageId: MESSAGE_ID,
            finishReason: 'complete',
            walletConversationContext: conversationContext,
          }),
        ]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      now: () => now,
      walletSession,
      randomUuid: (() => {
        const values = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
        return () => values.shift()!;
      })(),
      walletConversationContextCache: {
        clear: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        get: () => Promise.resolve(undefined),
        put,
      },
    });
    await runtime.acceptConsent();

    await runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 0,
      input: { kind: 'append', text: 'Transactions' },
    });

    expect(updates).toContainEqual(expect.objectContaining({
      kind: 'messageCompleted',
      messageId: MESSAGE_ID,
      walletControls: {
        expiresAt: '2026-08-05T12:15:00.000Z',
        scopeChoices: [{ choiceId: `choice_${'b'.repeat(32)}`, label: 'Wallet A' }],
      },
    }));
    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      threadId: THREAD_ID,
      messageId: MESSAGE_ID,
      sessionId: authority.sessionId,
      revision: authority.revision,
    }), conversationContext);
    const binding = put.mock.calls[0][0];
    expect(binding.profileDigest).not.toBe(binding.accountDigest);
    expect(binding).toEqual(expect.objectContaining({
      accountDigest: expect.any(String),
      profileDigest: expect.any(String),
      deviceId: DEVICE_ID,
    }));
  });

  it.each(['classic', 'ios'] as const)(
    'restores authority-matched wallet controls from message hydration on %s',
    async (platform) => {
      const now = Date.parse('2026-08-05T12:00:00.000Z');
      const storage = createMemoryStorage();
      await storeIdentity(storage);
      const walletSession = new AgentV2WalletSession();
      const host = {
        ...receiveHost('ton'),
        platform,
        client: platform === 'classic' ? 'web' as const : 'native' as const,
      };
      walletSession.update(host);
      const authority = walletSession.snapshot();
      const conversationContext = walletConversationContextV5(authority.sessionId, authority.revision);
      const get = jest.fn(() => Promise.resolve(conversationContext));
      const fetchMock = jest.fn((input: string | URL | Request) => {
        const url = getRequestUrl(input);
        if (url.includes('/messages?')) {
          return Promise.resolve(jsonResponse({
            protocolVersion: 2,
            threadId: THREAD_ID,
            messages: [{
              id: MESSAGE_ID,
              threadId: THREAD_ID,
              role: 'assistant',
              status: 'complete',
              content: { kind: 'semantic', content: { kind: 'notice', schemaVersion: 1, code: 'empty_result' } },
              createdAt: '2026-08-05T12:00:00.000Z',
            }],
          }));
        }
        if (url.endsWith(`/threads/${THREAD_ID}`)) {
          return Promise.resolve(jsonResponse({ protocolVersion: 2, thread: threadSummary() }));
        }
        return Promise.reject(new Error(`Unexpected URL ${url}`));
      }) as unknown as typeof fetch;
      const runtime = new AgentV2Runtime({
        storage,
        baseUrl: 'https://agent.test/api/v2',
        fetch: fetchMock,
        onUpdate: () => {},
        now: () => now,
        walletSession,
        walletConversationContextCache: {
          clear: () => Promise.resolve(),
          delete: () => Promise.resolve(),
          get,
          put: () => Promise.resolve(),
        },
      });
      await runtime.acceptConsent();

      const hydration = await runtime.getMessages(THREAD_ID);

      expect(hydration.messages[0].walletControls).toEqual({
        expiresAt: '2026-08-05T12:15:00.000Z',
        scopeChoices: [{ choiceId: `choice_${'b'.repeat(32)}`, label: 'Wallet A' }],
      });
      expect(get).toHaveBeenCalledTimes(1);
    },
  );

  it('clears cached wallet contexts on identity logout', async () => {
    const clear = jest.fn(() => Promise.resolve());
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: jest.fn() as unknown as typeof fetch,
      onUpdate: () => {},
      walletConversationContextCache: {
        clear,
        delete: () => Promise.resolve(),
        get: () => Promise.resolve(undefined),
        put: () => Promise.resolve(),
      },
    });

    await runtime.acceptConsent();
    await runtime.destroy({ shouldClearPersistentIdentity: true });

    expect(clear).toHaveBeenCalledTimes(1);
    await expect(storage.getItem('agentV2Consent')).resolves.toBeUndefined();
    await expect(storage.getItem('agentV2DeviceIdentity')).resolves.toBeUndefined();
  });

  it('maps unknown finish reasons to interruption without reporting completion', async () => {
    const storage = createMemoryStorage();
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: DEVICE_ID,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      return Promise.resolve(ndjsonResponse([
        runStart(),
        messageStart(),
        event({ type: 'message_end', sequence: 3, messageId: MESSAGE_ID, finishReason: 'future_finish' }),
      ]));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: () => {},
      randomUuid: (() => {
        const values = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
        return () => values.shift()!;
      })(),
    });
    await runtime.acceptConsent();

    const result = await runtime.startRun({ expectedThreadRevision: 0, input: { kind: 'append', text: 'Hi' } });

    expect(result).toMatchObject({ state: 'interrupted', inputMessageId: MESSAGE_ID });
  });

  it('omits inputMessageId from regenerate admission and settlement', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const updates: AgentV2ClientUpdate[] = [];
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      if (url.endsWith('/runs')) {
        return Promise.resolve(ndjsonResponse([runStart(), messageStart(), messageEnd(3)]));
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => CLIENT_RUN_ID,
    });
    await runtime.acceptConsent();

    const result = await runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'regenerate', targetAssistantMessageId: MESSAGE_ID },
    });

    expect(result).not.toHaveProperty('inputMessageId');
    expect(updates.find(({ kind }) => kind === 'runStarted')).not.toHaveProperty('inputMessageId');
  });

  it('stops reconnecting after a terminal stream error and keeps thread routing', async () => {
    const updates: any[] = [];
    let runRequests = 0;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      runRequests += 1;
      return Promise.resolve(ndjsonResponse([
        runStart(),
        event({
          type: 'error',
          sequence: 2,
          code: 'provider_unavailable',
          retryable: true,
        }),
      ]));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift()!,
      wait: () => Promise.resolve(),
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Hello' },
    })).resolves.toMatchObject({ state: 'failed' });
    expect(runRequests).toBe(1);
    expect(updates).toContainEqual({
      kind: 'runFailed',
      clientRunId: CLIENT_RUN_ID,
      runId: RUN_ID,
      threadId: THREAD_ID,
      code: 'provider_unavailable',
      retryable: true,
    });
  });

  it('surfaces a malformed replay event as a terminal safe failure', async () => {
    const updates: any[] = [];
    let runRequests = 0;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      runRequests += 1;
      return Promise.resolve(rawNdjsonResponse(`${JSON.stringify(runStart())}\n{malformed\n`));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift()!,
      wait: () => Promise.resolve(),
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Hello' },
    })).resolves.toMatchObject({ state: 'failed' });
    expect(runRequests).toBe(1);
    expect(updates).toContainEqual({
      kind: 'runFailed',
      clientRunId: CLIENT_RUN_ID,
      runId: RUN_ID,
      threadId: THREAD_ID,
      code: 'invalid_event',
      retryable: false,
    });
  });

  it('does not reconnect after an unexpected consumer programming error', async () => {
    const updates: any[] = [];
    let runRequests = 0;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      runRequests += 1;
      return Promise.resolve(ndjsonResponse([runStart()]));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => {
        if (update.kind === 'runStarted') throw new Error('consumer programming error');
        updates.push(update);
      },
      randomUuid: (() => {
        const values = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
        return () => values.shift()!;
      })(),
      wait: () => Promise.resolve(),
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Hello' },
    })).resolves.toMatchObject({ state: 'failed' });

    expect(runRequests).toBe(1);
    expect(updates).toContainEqual(expect.objectContaining({
      kind: 'runFailed', code: 'invalid_event', retryable: false,
    }));
  });

  it('retries a browser network exception before run admission', async () => {
    let runRequests = 0;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      runRequests += 1;
      if (runRequests === 1) return Promise.reject(new DOMException('Offline', 'NetworkError'));
      return Promise.resolve(ndjsonResponse([
        runStart(),
        event({ type: 'error', sequence: 2, code: 'provider_unavailable', retryable: true }),
      ]));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
      randomUuid: () => ids.shift()!,
      wait: () => Promise.resolve(),
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Hello' },
    })).resolves.toMatchObject({ state: 'failed' });
    expect(runRequests).toBe(2);
  });

  it('retries pre-admission server failures within the bounded attempt budget', async () => {
    const updates: any[] = [];
    let runRequests = 0;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      runRequests += 1;
      if (runRequests < 3) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          error: { code: 'provider_unavailable', retryable: true },
        }, 503));
      }
      return Promise.resolve(ndjsonResponse([runStart(), messageStart(), messageEnd(3)]));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: (() => {
        const values = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
        return () => values.shift()!;
      })(),
      wait: () => Promise.resolve(),
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Hello' },
    })).resolves.toMatchObject({ state: 'completed' });

    expect(runRequests).toBe(3);
    expect(updates.some(({ kind }) => kind === 'runFailed')).toBe(false);
  });

  it('ignores an unknown optional event without reconnecting or failing the run', async () => {
    const updates: any[] = [];
    let runRequests = 0;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      runRequests += 1;
      return Promise.resolve(ndjsonResponse([
        runStart(),
        event({ type: 'run_activity', sequence: 2, code: 'web.searching', status: 'active' }),
        event({
          type: 'message_start', sequence: 3, messageId: MESSAGE_ID,
          role: 'assistant', contentKind: 'markdown',
        }),
        event({ type: 'future_optional', sequence: 4 }),
        event({ type: 'text_delta', sequence: 5, messageId: MESSAGE_ID, delta: 'Still running' }),
        messageEnd(6),
      ]));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift()!,
      wait: () => Promise.resolve(),
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Hello' },
    })).resolves.toMatchObject({ state: 'completed' });
    expect(runRequests).toBe(1);
    expect(updates.some(({ kind }) => kind === 'runFailed')).toBe(false);
    expect(updates).toContainEqual(expect.objectContaining({
      kind: 'textDelta',
      delta: 'Still running',
    }));
    expect(updates).toContainEqual(expect.objectContaining({
      kind: 'runActivityChanged',
      event: expect.objectContaining({ code: 'web.searching', status: 'active' }),
    }));
  });

  it('routes a pre-admission failure by client run and requested thread', async () => {
    const updates: any[] = [];
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      return Promise.resolve(jsonResponse({
        protocolVersion: 2,
        error: {
          code: 'thread_not_found',
          retryable: false,
          threadId: THREAD_ID,
        },
      }, 404));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift()!,
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Hello' },
    })).resolves.toMatchObject({ clientRunId: CLIENT_RUN_ID, state: 'failed' });
    expect(updates).toContainEqual({
      kind: 'runFailed',
      clientRunId: CLIENT_RUN_ID,
      threadId: THREAD_ID,
      code: 'thread_not_found',
      retryable: false,
    });
  });

  it('surfaces retryable semantic admission conflicts instead of replaying the same stale request', async () => {
    const updates: any[] = [];
    let runRequests = 0;
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      if (url.includes('/hints')) return Promise.resolve(disabledHintsResponse());
      runRequests += 1;
      return Promise.resolve(jsonResponse({
        protocolVersion: 2,
        error: {
          code: 'thread_revision_conflict',
          retryable: true,
          threadId: THREAD_ID,
          currentThread: threadSummary({ revision: 2 }),
        },
      }, 409));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift()!,
      wait: () => Promise.resolve(),
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Hello' },
    })).resolves.toMatchObject({ clientRunId: CLIENT_RUN_ID, state: 'failed' });
    expect(runRequests).toBe(1);
    expect(updates).toContainEqual(expect.objectContaining({
      kind: 'runFailed',
      clientRunId: CLIENT_RUN_ID,
      threadId: THREAD_ID,
      code: 'thread_revision_conflict',
      retryable: true,
    }));
  });

  it('rejects a run_start that changes an explicitly requested thread binding', async () => {
    const updates: any[] = [];
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      return Promise.resolve(ndjsonResponse([
        boundEvent(RUN_ID, {
          type: 'run_start',
          sequence: 1,
          clientRunId: CLIENT_RUN_ID,
          threadId: THREAD_ID_2,
          threadRevision: 1,
        }),
      ]));
    }) as unknown as typeof fetch;
    const ids = [CLIENT_RUN_ID, MESSAGE_ID, DEVICE_ID];
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: (update) => updates.push(update),
      randomUuid: () => ids.shift()!,
    });
    await runtime.acceptConsent();

    await expect(runtime.startRun({
      threadId: THREAD_ID,
      expectedThreadRevision: 1,
      input: { kind: 'append', text: 'Hello' },
    })).resolves.toMatchObject({ state: 'failed' });
    expect(updates).toEqual([{
      kind: 'runFailed',
      clientRunId: CLIENT_RUN_ID,
      runId: RUN_ID,
      threadId: THREAD_ID,
      code: 'invalid_event',
      retryable: false,
    }]);
  });

  it('uses only default, get, message-history and clear thread requests', async () => {
    const requests: { url: string; method?: string; body?: any }[] = [];
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      requests.push({
        url,
        ...(init?.method ? { method: init.method } : {}),
        ...(init?.body ? { body: JSON.parse(init.body as string) } : {}),
      });
      if (url.includes('/messages?')) {
        return Promise.resolve(jsonResponse({ protocolVersion: 2, threadId: THREAD_ID, messages: [] }));
      }
      if (url.endsWith('/clear')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          thread: threadSummary({ revision: 2 }),
          duplicate: false,
        }));
      }
      if (url.endsWith('/threads/default')) {
        return Promise.resolve(jsonResponse({ protocolVersion: 2, thread: threadSummary(), created: false }));
      }
      if (url.endsWith(`/threads/${THREAD_ID}`)) {
        return Promise.resolve(jsonResponse({ protocolVersion: 2, thread: threadSummary() }));
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: () => {},
      randomUuid: () => DEVICE_ID,
    });
    await runtime.acceptConsent();
    await runtime.updateHostContext(receiveHost('ton'));
    await runtime.getDefaultThread();
    await runtime.getMessages(THREAD_ID, 'older_page', 20);
    await runtime.clearThread(THREAD_ID, 1);

    expect(requests).toEqual([
      { url: 'https://agent.test/api/v2/threads/default' },
      {
        url: `https://agent.test/api/v2/threads/${THREAD_ID}/messages?limit=20&cursor=older_page`,
      },
      { url: `https://agent.test/api/v2/threads/${THREAD_ID}` },
      {
        url: `https://agent.test/api/v2/threads/${THREAD_ID}/clear`,
        method: 'POST',
        body: {
          protocolVersion: 2,
          expectedThreadRevision: 1,
          clientOperationId: expect.any(String),
        },
      },
    ]);
  });

  it('restores persisted capacity failures from message history', async () => {
    const storage = createMemoryStorage();
    await storeIdentity(storage);
    const fetchMock = jest.fn((input: string | URL | Request) => {
      const url = getRequestUrl(input);
      if (url.includes('/messages?')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          threadId: THREAD_ID,
          messages: [{
            id: MESSAGE_ID,
            threadId: THREAD_ID,
            role: 'user',
            status: 'complete',
            content: { kind: 'markdown', text: 'Try the Agent' },
            createdAt: '2026-08-15T12:00:00.000Z',
          }, {
            id: MESSAGE_ID_2,
            threadId: THREAD_ID,
            role: 'assistant',
            status: 'error',
            runId: RUN_ID,
            error: { code: 'agent_capacity_exhausted', retryable: true },
            createdAt: '2026-08-15T12:00:01.000Z',
          }, {
            id: MESSAGE_ID_3,
            threadId: THREAD_ID,
            role: 'assistant',
            status: 'error',
            runId: RUN_ID_2,
            error: { code: 'provider_error', retryable: true },
            createdAt: '2026-08-15T12:00:02.000Z',
          }],
        }));
      }
      if (url.endsWith(`/threads/${THREAD_ID}`)) {
        return Promise.resolve(jsonResponse({ protocolVersion: 2, thread: threadSummary() }));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage,
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: jest.fn(),
    });
    await runtime.acceptConsent();

    const hydration = await runtime.getMessages(THREAD_ID);

    expect(hydration.messages.map(({ id }) => id)).toEqual([MESSAGE_ID, MESSAGE_ID_2, MESSAGE_ID_3]);
  });

  it('rejects message hydration that changes the requested thread binding', async () => {
    const fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      if (url.endsWith('/device-token')) {
        return Promise.resolve(jsonResponse({
          protocolVersion: 2,
          deviceId: JSON.parse(init?.body as string).deviceId,
          deviceToken: `adt_v2.${'a'.repeat(43)}`,
          expiresAt: '2026-10-14T00:00:00.000Z',
        }));
      }
      return Promise.resolve(jsonResponse({
        protocolVersion: 2,
        threadId: THREAD_ID_2,
        messages: [],
      }));
    }) as unknown as typeof fetch;
    const runtime = new AgentV2Runtime({
      storage: createMemoryStorage(),
      baseUrl: 'https://agent.test/api/v2',
      fetch: fetchMock,
      onUpdate: () => {},
      randomUuid: () => DEVICE_ID,
    });
    await runtime.acceptConsent();

    await expect(runtime.getMessages(THREAD_ID)).rejects.toMatchObject({
      code: 'invalid_event',
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function runStart() {
  return event({
    type: 'run_start', sequence: 1, clientRunId: CLIENT_RUN_ID, threadId: THREAD_ID, threadRevision: 1,
  });
}

function messageStart() {
  return event({
    type: 'message_start', sequence: 2, messageId: MESSAGE_ID, role: 'assistant', contentKind: 'markdown',
  });
}

function textDelta(delta: string, sequence = 3) {
  return event({ type: 'text_delta', sequence, messageId: MESSAGE_ID, delta });
}

function messageContentEnd(sequence: number) {
  return event({ type: 'message_content_end', sequence, messageId: MESSAGE_ID });
}

function actionEvent(sequence: number) {
  return event({
    type: 'action',
    sequence,
    messageId: MESSAGE_ID,
    action: {
      id: TOOL_CALL_ID,
      kind: 'receive',
      labelCode: 'open_receive',
      effect: 'open_receive',
      contextBinding: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        activeAccountRef: 'current',
        activeNetwork: 'ton',
      },
      localDraftRequired: false,
      requiresConfirmation: false,
    },
  });
}

function toolCallEvent(sequence: number) {
  return event({
    type: 'tool_call',
    sequence,
    toolCall: {
      id: TOOL_CALL_ID,
      name: 'wallet.data.query',
      version: 5,
      arguments: {
        schemaVersion: 5,
        operation: 'assets.search',
        query: 'TON',
        chains: ['ton'],
        pageSize: 10,
      },
      scopes: ['wallet.data.read'],
      timeoutMs: 1_000,
      walletContextSession: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        accountScope: 'current',
        activeAccountRef: 'current',
        activeNetwork: 'ton',
      },
      intentSource: { kind: 'userMessage', messageId: MESSAGE_ID },
    },
  });
}

function privateToolCallEvent(sequence: number) {
  return event({
    type: 'tool_call',
    sequence,
    toolCall: {
      id: TOOL_CALL_ID,
      name: 'wallet.data.query',
      version: 5,
      arguments: {
        schemaVersion: 5,
        operation: 'assets.search',
        query: PRIVATE_TOOL_ARGUMENT,
        chains: ['ton'],
        pageSize: 10,
      },
      scopes: ['wallet.data.read'],
      timeoutMs: 1_000,
      walletContextSession: {
        sessionId: WALLET_SESSION_ID,
        revision: 1,
        accountScope: 'current',
        activeAccountRef: 'current',
        activeNetwork: 'ton',
      },
      reason: PRIVATE_TOOL_REASON,
    },
  });
}

function toolStatusEvent(
  sequence: number,
  status: 'queued' | 'running' | 'complete' | 'failed' | 'timeout' | 'rejected' | 'cancelled',
  detailCode?: 'awaiting_wallet' | 'processing' | 'result_rejected' | 'result_timeout' | 'result_unavailable',
) {
  return event({
    type: 'tool_status',
    sequence,
    toolCallId: TOOL_CALL_ID,
    status,
    ...(detailCode ? { detailCode } : {}),
  });
}

function threadEvent(sequence: number) {
  return event({
    type: 'thread',
    sequence,
    thread: threadSummary({
      revision: 2,
      messageCount: 2,
    }),
  });
}

function messageEnd(sequence: number) {
  return event({ type: 'message_end', sequence, messageId: MESSAGE_ID, finishReason: 'complete' });
}

function walletConversationContextV5(
  sessionId: string,
  revision: number,
): AgentWalletConversationContextV5 {
  return {
    schemaVersion: 5,
    sourceAssistantMessageId: MESSAGE_ID,
    sessionId,
    revision,
    operation: 'account.inventory',
    query: {
      schemaVersion: 5,
      operation: 'account.inventory',
      accountSelector: { kind: 'named', label: 'Wallet A' },
      chains: ['ton'],
    },
    scopeChoices: [{
      choiceId: `choice_${'b'.repeat(32)}`,
      scopeAnchor: `scope_${'c'.repeat(32)}`,
      label: 'Wallet A',
      ordinal: 1,
      chains: ['ton'],
    }],
    expiresAt: '2026-08-05T12:15:00.000Z',
  };
}

function event(extra: Record<string, unknown>) {
  return { protocolVersion: 2, runId: RUN_ID, ...extra };
}

function boundEvent(runId: string, extra: Record<string, unknown>) {
  return { protocolVersion: 2, runId, ...extra };
}

function ndjsonResponse(events: unknown[]): Response {
  const contents = events.map((item) => JSON.stringify(item)).join('\n').concat('\n');
  return rawNdjsonResponse(contents);
}

function rawNdjsonResponse(contents: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/x-ndjson; charset=utf-8' }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(contents));
        controller.close();
      },
    }),
  } as Response;
}

function openNdjsonResponse(initialEvents: unknown[]) {
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const encode = (events: unknown[]) => new TextEncoder().encode(
    events.map((item) => JSON.stringify(item)).join('\n').concat('\n'),
  );
  const response = {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/x-ndjson; charset=utf-8' }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(encode(initialEvents));
      },
    }),
  } as Response;
  return {
    response,
    finish(events: unknown[]) {
      streamController.enqueue(encode(events));
      streamController.close();
    },
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: () => Promise.resolve(value),
  } as Response;
}

function disabledHintsResponse(): Response {
  return jsonResponse({
    protocolVersion: 2,
    catalogVersion: 'agent-starter-hints-v1',
    items: [],
    serverCapabilities: { webSearch: 'disabled' },
  });
}

function starterHintsResponse(
  items: unknown[],
  webSearch: 'available' | 'disabled' | 'unavailable' = 'available',
): Response {
  return jsonResponse({
    protocolVersion: 2,
    catalogVersion: 'agent-starter-hints-v1',
    items,
    serverCapabilities: { webSearch },
  });
}

function featureCapabilitiesResponse(
  walletQuery: 'available' | 'disabled',
  stakingOffer?: 'available' | 'disabled',
): Response {
  return jsonResponse({
    protocolVersion: 2,
    portfolioPositions: 'disabled',
    walletQuery,
    ...(stakingOffer ? { stakingOffer } : {}),
  });
}

function walletQueryCapabilitiesResponse(digest: string): Response {
  return jsonResponse({
    protocolVersion: 2,
    status: 'available',
    supportedToolVersions: [5],
    filterCatalog: {
      version: 1,
      digest,
      requiresClientTimeZone: true,
    },
  });
}

function threadSummary(extra: Record<string, unknown> = {}) {
  return {
    id: THREAD_ID,
    revision: 1,
    metadataRevision: 1,
    titleSource: 'none',
    isPinned: false,
    isDefault: true,
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    lastActivityAt: '2026-07-16T00:00:00.000Z',
    messageCount: 0,
    ...extra,
  };
}

function createMemoryStorage(): Storage {
  const values = new Map<string, unknown>([['agentV2WalletProtocolVersion', '5']]);
  return {
    getItem: (name) => Promise.resolve(values.get(name)),
    setItem(name, value) {
      values.set(name, value);
      return Promise.resolve();
    },
    removeItem(name) {
      values.delete(name);
      return Promise.resolve();
    },
    clear() {
      values.clear();
      return Promise.resolve();
    },
  };
}

async function storeIdentity(storage: Storage) {
  await storage.setItem('agentV2DeviceIdentity', JSON.stringify({
    version: 1,
    deviceId: DEVICE_ID,
    deviceToken: `adt_v2.${'a'.repeat(43)}`,
    expiresAt: '2026-10-14T00:00:00.000Z',
  }));
}

function getRequestUrl(input: string | URL | Request) {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function receiveHost(activeNetwork: 'ton' | 'tron', isViewOnly = true) {
  return {
    platform: 'classic' as const,
    client: 'web' as const,
    lang: 'en',
    baseCurrency: 'USD',
    activeAccountId: 'view-account',
    activeNetwork,
    accounts: [{
      accountId: 'view-account',
      state: 'active' as const,
      accountType: isViewOnly ? 'viewOnly' as const : 'regular' as const,
      isViewOnly,
      chains: ['ton', 'tron'],
      addresses: { ton: 'EQ-view', tron: 'T-view' },
      holdings: [],
    }],
    savedAddresses: [],
  };
}

function stakeHost() {
  return {
    ...receiveHost('ton', false),
    isTestnet: false,
    assetCatalog: [{
      slug: 'toncoin', chain: 'ton' as const, symbol: 'TON', decimals: 9,
    }],
    stakingOffers: [{
      productId: 'liquid',
      asset: { slug: 'toncoin', chain: 'ton' as const, symbol: 'TON', decimals: 9 },
      annualYield: '14.09',
      yieldType: 'APY' as const,
      availability: 'available' as const,
    }],
  };
}

function stakingOfferHost() {
  return {
    ...receiveHost('ton'),
    isTestnet: false,
    assetCatalog: [{
      slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9,
    }],
    stakingOffers: [{
      productId: 'liquid',
      asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9 },
      annualYield: '14.09',
      yieldType: 'APY' as const,
      availability: 'available' as const,
    }],
  };
}

function liveSwapAction() {
  return {
    id: '69696969-6969-4969-8969-696969696968',
    schemaVersion: 1 as const,
    kind: 'swap' as const,
    labelCode: 'open_swap' as const,
    effect: 'open_swap' as const,
    sourceToolCallId: TOOL_CALL_ID,
    contextBinding: {
      sessionId: WALLET_SESSION_ID,
      revision: 4,
      activeAccountRef: 'account_current',
    },
    sourceAsset: { slug: 'toncoin', chain: 'ton' as const, symbol: 'TON', decimals: 9 },
    destinationAsset: { slug: 'usdton', chain: 'ton' as const, symbol: 'USDT', decimals: 6 },
    amount: { value: '10', valueType: 'decimal' as const, side: 'source' as const },
    localDraftRequired: false as const,
    requiresConfirmation: false as const,
  };
}

function persistedSwapAction() {
  return {
    id: '69696969-6969-4969-8969-696969696967',
    schemaVersion: 1 as const,
    kind: 'swap' as const,
    labelCode: 'open_swap' as const,
    effect: 'open_swap' as const,
    sourceAsset: { slug: 'usdton', chain: 'ton' as const, symbol: 'USDT', decimals: 6 },
    destinationAsset: { slug: 'toncoin', chain: 'ton' as const, symbol: 'TON', decimals: 9 },
    amount: { value: '10', valueType: 'decimal' as const, side: 'destination' as const },
    localDraftRequired: false as const,
    requiresConfirmation: false as const,
  };
}

function persistedSendAction() {
  return {
    id: '69696969-6969-4969-8969-696969696966',
    kind: 'send' as const,
    labelCode: 'review_transfer' as const,
    draftId: '69696969-6969-4969-8969-696969696965',
    draftExpiresAt: '2099-08-18T12:10:00.000Z',
    sourceToolCallId: TOOL_CALL_ID,
    effect: 'open_wallet_review' as const,
    localDraftRequired: true as const,
    requiresConfirmation: true as const,
  };
}

function assertFixtureEvent(value: never): never {
  throw new Error(`Unexpected terminal fixture event: ${JSON.stringify(value)}`);
}
