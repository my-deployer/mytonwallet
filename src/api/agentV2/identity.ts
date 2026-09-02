import type { Storage } from '../storages/types';
import type { AgentErrorCodeV2, AgentUserQuotaV2 } from './protocol/types';

import { mergeAbortSignals } from '../../util/abortSignal';
import {
  decodeAgentV2ApiError,
  decodeAgentV2DeviceToken,
} from './protocol/transportContracts';

export const AGENT_V2_DEVICE_IDENTITY_STORAGE_KEY = 'agentV2DeviceIdentity';
const TOKEN_PATTERN = /^adt_v2\.[A-Za-z0-9_-]{43}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const HTTP_REQUEST_FAILED_MESSAGE = 'Agent request failed.';

interface AgentV2DeviceIdentity {
  version: 1;
  deviceId: string;
  deviceToken: string;
  expiresAt: string;
}

export class AgentV2HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: AgentErrorCodeV2,
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
    readonly resetAt?: string,
    readonly quota?: AgentUserQuotaV2,
  ) {
    super(message);
    this.name = 'AgentV2HttpError';
  }
}

export interface AgentV2IdentityDependencies {
  storage: Storage;
  baseUrl: string;
  fetch: typeof fetch;
  now?: () => number;
  randomUuid?: () => string;
}

export class AgentV2IdentityService {
  private readonly now: () => number;
  private readonly randomUuid: () => string;
  private readonly lifecycleController = new AbortController();
  private currentIdentity?: AgentV2DeviceIdentity;
  private issuance?: Promise<AgentV2DeviceIdentity>;

  constructor(private readonly dependencies: AgentV2IdentityDependencies) {
    this.now = dependencies.now ?? Date.now;
    this.randomUuid = dependencies.randomUuid ?? (() => crypto.randomUUID());
  }

  async authenticatedFetch(
    input: string,
    init: RequestInit = {},
    {
      shouldSkipUnauthorizedRecovery = false,
    }: { shouldSkipUnauthorizedRecovery?: boolean } = {},
  ): Promise<Response> {
    this.assertActive(init.signal);
    let identity = await this.getOrIssue();
    this.assertActive(init.signal);
    let response = await this.request(input, init, identity.deviceToken);
    this.assertActive(init.signal);

    if (response.status === 401 && !shouldSkipUnauthorizedRecovery) {
      identity = await this.recoverAfterUnauthorized(identity);
      this.assertActive(init.signal);
      response = await this.request(input, init, identity.deviceToken);
      this.assertActive(init.signal);
    }

    return response;
  }

  async destroy({
    shouldClearPersistentIdentity = false,
  }: { shouldClearPersistentIdentity?: boolean } = {}) {
    this.lifecycleController.abort();
    const issuance = this.issuance;
    this.currentIdentity = undefined;
    this.issuance = undefined;
    if (issuance) await issuance.catch(() => undefined);
    if (shouldClearPersistentIdentity) {
      await this.dependencies.storage.removeItem(AGENT_V2_DEVICE_IDENTITY_STORAGE_KEY);
    }
  }

  async getDeviceId(signal?: AbortSignal) {
    this.assertActive(signal);
    const identity = await this.getOrIssue();
    this.assertActive(signal);
    return identity.deviceId;
  }

  private async getOrIssue() {
    this.assertActive();
    if (this.currentIdentity && this.isUsable(this.currentIdentity)) return this.currentIdentity;

    const stored = await this.read();
    this.assertActive();
    if (this.currentIdentity && this.isUsable(this.currentIdentity)) return this.currentIdentity;
    if (stored && this.isUsable(stored)) {
      this.currentIdentity = stored;
      return stored;
    }
    return this.issue(stored?.deviceId ?? this.randomUuid());
  }

  private async recoverAfterUnauthorized(rejectedIdentity: AgentV2DeviceIdentity) {
    this.assertActive();
    if (
      this.currentIdentity
      && this.isUsable(this.currentIdentity)
      && this.currentIdentity.deviceToken !== rejectedIdentity.deviceToken
    ) {
      return this.currentIdentity;
    }

    const stored = await this.read();
    this.assertActive();
    if (
      this.currentIdentity
      && this.isUsable(this.currentIdentity)
      && this.currentIdentity.deviceToken !== rejectedIdentity.deviceToken
    ) {
      return this.currentIdentity;
    }
    if (
      stored
      && this.isUsable(stored)
      && stored.deviceToken !== rejectedIdentity.deviceToken
    ) {
      this.currentIdentity = stored;
      return stored;
    }

    return this.issue(rejectedIdentity.deviceId);
  }

  private issue(deviceId: string): Promise<AgentV2DeviceIdentity> {
    this.assertActive();
    if (this.issuance) return this.issuance;

    const operation = this.performIssue(deviceId).finally(() => {
      if (this.issuance === operation) this.issuance = undefined;
    });
    this.issuance = operation;
    return operation;
  }

  private async performIssue(deviceId: string): Promise<AgentV2DeviceIdentity> {
    const response = await this.dependencies.fetch(`${this.dependencies.baseUrl}/device-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 2, deviceId }),
      cache: 'no-store',
      signal: this.lifecycleController.signal,
    });
    this.assertActive();
    if (!response.ok) throw await decodeHttpError(response);
    const result = decodeAgentV2DeviceToken(await response.json());
    this.assertActive();
    const identity: AgentV2DeviceIdentity = {
      version: 1,
      deviceId: result.deviceId,
      deviceToken: result.deviceToken,
      expiresAt: result.expiresAt,
    };
    await this.dependencies.storage.setItem(AGENT_V2_DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(identity));
    this.assertActive();
    this.currentIdentity = identity;
    return identity;
  }

  private isUsable(identity: AgentV2DeviceIdentity) {
    return Date.parse(identity.expiresAt) > this.now() + TOKEN_EXPIRY_SKEW_MS;
  }

  private async request(input: string, init: RequestInit, token: string) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const { signal, cleanup } = mergeAbortSignals(init.signal, this.lifecycleController.signal);
    try {
      return await this.dependencies.fetch(input, { ...init, headers, signal });
    } finally {
      cleanup();
    }
  }

  private async read(): Promise<AgentV2DeviceIdentity | undefined> {
    const stored = await this.dependencies.storage.getItem(AGENT_V2_DEVICE_IDENTITY_STORAGE_KEY);
    try {
      const value = typeof stored === 'string' ? JSON.parse(stored) as Partial<AgentV2DeviceIdentity> : stored;
      if (
        value?.version !== 1
        || !UUID_PATTERN.test(value.deviceId ?? '')
        || !TOKEN_PATTERN.test(value.deviceToken ?? '')
        || !Number.isFinite(Date.parse(value.expiresAt ?? ''))
      ) {
        if (stored !== undefined) {
          await this.dependencies.storage.removeItem(AGENT_V2_DEVICE_IDENTITY_STORAGE_KEY);
        }
        return undefined;
      }
      return value as AgentV2DeviceIdentity;
    } catch {
      await this.dependencies.storage.removeItem(AGENT_V2_DEVICE_IDENTITY_STORAGE_KEY);
      return undefined;
    }
  }

  private assertActive(signal?: AbortSignal | null) {
    if (this.lifecycleController.signal.aborted) {
      throw new Error('Agent V2 identity is destroyed');
    }
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
  }
}

export async function decodeHttpError(response: Response): Promise<AgentV2HttpError> {
  try {
    const result = decodeAgentV2ApiError(await response.json());
    return new AgentV2HttpError(
      response.status,
      result.error.code,
      HTTP_REQUEST_FAILED_MESSAGE,
      result.error.retryable,
      result.error.retryAfterMs,
      result.error.resetAt,
      result.error.quota,
    );
  } catch {
    return new AgentV2HttpError(
      response.status,
      'provider_unavailable',
      'Agent is temporarily unavailable.',
      response.status >= 500,
    );
  }
}
