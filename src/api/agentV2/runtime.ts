import type { Storage } from '../storages/types';
import type {
  AgentActionProposal,
  AgentApiChain,
  AgentAvailabilityResponseV2,
  AgentEntryPoint,
  AgentMessageEndEvent,
  AgentPersistedActionV2,
  AgentPersistedNavigationActionV3,
  AgentRunRequestWireV2,
  AgentSemanticContentV1,
  AgentStreamEventV2,
  AgentToolCall,
  AgentToolResultRequestV2,
  AgentUserQuotaResponseV2,
  AgentWalletContextV2,
  AgentWalletConversationContextV5,
  AgentWalletSemanticOperationV2,
} from './protocol/types';
import type {
  AgentV2ActionPresentation,
  AgentV2ClientUpdate,
  AgentV2Hints,
  AgentV2HostContextSnapshot,
  AgentV2HydratedMessage,
  AgentV2ResolvedAction,
  AgentV2RunCommand,
  AgentV2RunResult,
  AgentV2ThreadHydration,
  AgentV2WalletConversationControls,
} from './types';

import { pauseWithAbortSignal } from '../../util/abortSignal';
import { getIsSupportedChain } from '../../util/chain';
import { logDebug, logDebugError } from '../../util/logs';
import {
  AgentV2CompatibilityError,
  AgentV2ContractError,
  decodeAgentV2Availability,
  decodeAgentV2DefaultThread,
  decodeAgentV2FeatureCapabilities,
  decodeAgentV2Hints,
  decodeAgentV2Messages,
  decodeAgentV2RunCancel,
  decodeAgentV2Thread,
  decodeAgentV2ThreadClear,
  decodeAgentV2ToolResultAck,
  decodeAgentV2UserQuota,
  decodeAgentV2WalletConversationContextV5,
  decodeAgentV2WalletQueryCapabilitiesV2,
} from './protocol/transportContracts';
import { supportsAgentV2StakingAction } from './actionPlatformPolicy';
import { BoundedRetainedRegistry } from './boundedRetainedRegistry';
import {
  AGENT_V2_CUSTOM_WRITER_INSTRUCTION_HEADER,
  encodeAgentV2CustomWriterInstructionHeader,
} from './customWriterInstruction';
import {
  AgentV2HttpError,
  AgentV2IdentityService,
  decodeHttpError,
} from './identity';
import {
  type AgentV2StreamBinding,
  AgentV2StreamProtocolError,
  AgentV2StreamTransportError,
  parseAgentV2Ndjson,
} from './ndjson';
import { buildAgentV2RunOrigin } from './runCommand';
import { getAgentToolExecutionTimeout } from './toolDeadline';
import {
  type AgentV2WalletContextCacheBinding,
  type AgentV2WalletConversationContextCache,
  createAgentV2WalletConversationContextCache,
} from './walletConversationContextCache';
import { clearAgentV2WalletSensitiveProtocolState } from './walletSensitiveCache';
import { AgentV2WalletSession } from './walletSession';

export const AGENT_V2_CONSENT_STORAGE_KEY = 'agentV2Consent';
const WALLET_PROTOCOL_STORAGE_KEY = 'agentV2WalletProtocolVersion';
const WALLET_PROTOCOL_VERSION = '5';
const RECONNECT_MAX_DELAY_MS = 2_000;
const RETRY_BASE_DELAY_MS = 250;
const RECONNECT_BACKOFF_EXPONENT_CAP = 3;
const PRE_ADMISSION_MAX_ATTEMPTS = 3;
const STREAM_PROTOCOL_NO_PROGRESS_MAX_ATTEMPTS = 3;
const TOOL_RESULT_MAX_ATTEMPTS = 3;
const FEATURE_CAPABILITIES_CACHE_MS = 5 * 60_000;
const REMOTE_CANCEL_TIMEOUT_MS = 3_000;
const UTC_DAY_MS = 24 * 60 * 60_000;
const FAILED_RUN_RETRY_GRACE_MS = 5 * 60_000;
const FAILED_RUN_RETRY_MAX_TTL_MS = UTC_DAY_MS;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const ACTION_MAX_ENTRIES = 512;
const ACTION_TTL_MS = UTC_DAY_MS;
const WALLET_CONVERSATION_MAX_THREADS = 32;
const WALLET_CONVERSATION_TTL_MS = 30 * 60_000;
const LIVE_ACTION_NAMESPACE = 'live';
const PERSISTED_ACTION_NAMESPACE = 'persisted';
const WALLET_CONVERSATION_NAMESPACE = 'context';
const STRUCTURED_OUTPUT_INVALIDATING_EVENT_TYPES = new Set<AgentStreamEventV2['type']>([
  'text_delta',
  'tool_call',
  'tool_status',
  'error',
  'rate_limit',
]);
interface PendingStructuredOutput {
  messageId: string;
  actions: AgentActionProposal[];
  semanticContent?: AgentSemanticContentV1;
  isInvalid: boolean;
}

interface RunState {
  authorityGeneration: number;
  clientRunId: string;
  request: AgentRunRequestWireV2;
  customWriterInstructionHeader?: string;
  controller: AbortController;
  binding: AgentV2StreamBinding;
  outcome?: AgentV2RunResult['state'];
  threadId?: string;
  messageId?: string;
  pendingToolResults: Map<string, AgentToolResultRequestV2>;
  pendingToolCallIds: Set<string>;
  toolActivityByCallId: Map<string, {
    name: AgentToolCall['name'];
    operation?: AgentWalletSemanticOperationV2;
  }>;
  pendingStructuredOutput?: PendingStructuredOutput;
}

interface ScopedAction<T> {
  messageId: string;
  threadId: string;
  action: T;
}

interface FailedRunRequest {
  expiresAt: number;
  request: AgentRunRequestWireV2;
  customWriterInstructionHeader?: string;
}

export interface AgentV2ToolExecutionContext {
  deviceId: string;
  messageId: string;
  runId: string;
  threadId: string;
  signal: AbortSignal;
}

export interface AgentV2ToolExecutor {
  execute(toolCall: AgentToolCall, context: AgentV2ToolExecutionContext): Promise<AgentToolResultRequestV2>;
  discard(toolCallId: string): void;
  registerAction?(threadId: string, messageId: string, action: AgentActionProposal): void | Promise<void>;
  hydrateAction?(threadId: string, messageId: string, action: AgentPersistedActionV2): Promise<void>;
  getActionPresentation?(
    threadId: string,
    messageId: string,
    action: AgentActionProposal | AgentPersistedActionV2,
  ): AgentV2ActionPresentation;
  resolveAction?(threadId: string, messageId: string, action: AgentActionProposal): AgentV2ResolvedAction;
  resolvePersistedAction?(
    threadId: string,
    messageId: string,
    action: AgentPersistedActionV2,
  ): AgentV2ResolvedAction;
  clear?(
    threadId?: string,
    options?: {
      shouldClearPersistentState?: boolean;
      shouldRetainRevalidatedActions?: boolean;
    },
  ): void;
}

export interface AgentV2RuntimeDependencies {
  storage: Storage;
  baseUrl: string;
  fetch: typeof fetch;
  onUpdate: (update: AgentV2ClientUpdate) => void;
  now?: () => number;
  randomUuid?: () => string;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  walletSession?: AgentV2WalletSession;
  toolExecutor?: AgentV2ToolExecutor;
  walletConversationContextCache?: AgentV2WalletConversationContextCache;
  clearWalletSensitiveProtocolState?: () => Promise<void>;
}

export class AgentV2Runtime {
  private readonly identity: AgentV2IdentityService;
  private readonly walletSession: AgentV2WalletSession;
  private readonly randomUuid: () => string;
  private readonly wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  private readonly walletConversationContextCache?: AgentV2WalletConversationContextCache;
  private readonly lifecycleController = new AbortController();
  private readonly runs = new Map<string, RunState>();
  private readonly actions: BoundedRetainedRegistry;
  private readonly walletConversationContexts: BoundedRetainedRegistry;
  private readonly backgroundTasks = new Set<Promise<void>>();

  private authorityGeneration = 0;
  private walletContextGeneration = 0;
  private threadGeneration = 0;
  private consentPromise?: Promise<boolean>;
  private protocolStatePromise?: Promise<void>;
  private serverCapabilitiesReady = false;
  private serverCapabilitiesPromise?: Promise<void>;
  private featureCapabilitiesExpiresAt = 0;
  private featureCapabilitiesPromise?: Promise<void>;
  private isAvailabilitySupported?: boolean;
  private availabilityPromise?: Promise<void>;
  private availabilityTimer?: ReturnType<typeof setTimeout>;
  private availabilityGeneration = 0;
  private failedRunRequestTimer?: ReturnType<typeof setTimeout>;
  private isUserQuotaSupported?: boolean;
  private userQuotaPromise?: Promise<void>;
  private userQuotaTimer?: ReturnType<typeof setTimeout>;
  private toolExecutor: AgentV2ToolExecutor;
  private consentWritePromise?: Promise<boolean>;
  private failedRunRequest?: FailedRunRequest;

  constructor(private readonly dependencies: AgentV2RuntimeDependencies) {
    this.randomUuid = dependencies.randomUuid ?? (() => crypto.randomUUID());
    this.wait = dependencies.wait ?? pauseWithAbortSignal;
    this.actions = new BoundedRetainedRegistry(ACTION_MAX_ENTRIES, ACTION_TTL_MS, () => this.now());
    this.walletConversationContexts = new BoundedRetainedRegistry(
      WALLET_CONVERSATION_MAX_THREADS,
      WALLET_CONVERSATION_TTL_MS,
      () => this.now(),
      (entry, reason) => {
        if (reason === 'clear' || this.lifecycleController.signal.aborted) return;
        this.deleteRetainedWalletConversationContext(
          entry.key,
          entry.value as AgentWalletConversationContextV5,
        );
      },
    );
    this.walletSession = dependencies.walletSession ?? new AgentV2WalletSession();
    this.walletConversationContextCache = dependencies.walletConversationContextCache
      ?? createAgentV2WalletConversationContextCache(
        decodeAgentV2WalletConversationContextV5,
        dependencies.now,
      );
    this.toolExecutor = dependencies.toolExecutor ?? new UnsupportedToolExecutor(this.randomUuid);
    this.identity = new AgentV2IdentityService({
      storage: dependencies.storage,
      baseUrl: dependencies.baseUrl,
      fetch: dependencies.fetch,
      now: dependencies.now,
      randomUuid: this.randomUuid,
    });
  }

  setToolExecutor(executor: AgentV2ToolExecutor) {
    this.assertActive();
    this.toolExecutor = executor;
  }

  getConsent(): Promise<boolean> {
    this.assertActive();
    return this.ensureProtocolState().then(() => {
      this.assertActive();
      this.consentPromise ??= this.readConsent();
      return this.consentPromise;
    });
  }

  acceptConsent() {
    this.assertActive();
    const operation = this.persistConsent().finally(() => {
      if (this.consentWritePromise === operation) this.consentWritePromise = undefined;
    });
    this.consentWritePromise = operation;
    return operation;
  }

  private async persistConsent() {
    await this.ensureProtocolState();
    this.assertActive();
    const record = JSON.stringify({
      version: 2,
      accepted: true,
      updatedAt: new Date(this.now()).toISOString(),
    });
    await this.dependencies.storage.setItem(AGENT_V2_CONSENT_STORAGE_KEY, record);
    this.assertActive();
    this.consentPromise = Promise.resolve(true);
    return true;
  }

  async updateHostContext(snapshot?: AgentV2HostContextSnapshot) {
    this.assertActive();
    await this.ensureProtocolState();
    this.assertActive();
    const hadHostContext = Boolean(this.walletSession.snapshot().host);
    let walletSessionUpdate: ReturnType<AgentV2WalletSession['update']>;

    try {
      walletSessionUpdate = this.walletSession.update(snapshot);
    } catch (error) {
      logDebugError('AgentV2 host context', { stage: 'degraded_to_no_wallet' }, error);
      walletSessionUpdate = this.walletSession.update();
    }

    const {
      hasAuthorityChanged,
      hasWalletContextChanged,
      hasActionPolicyChanged,
    } = walletSessionUpdate;
    if (hasWalletContextChanged) {
      this.walletContextGeneration += 1;
      this.walletConversationContexts.clear();
      if (hadHostContext && this.walletConversationContextCache) {
        this.trackBackgroundTask(this.walletConversationContextCache.clear().catch(() => undefined));
      }
    }
    if (hasWalletContextChanged || hasActionPolicyChanged) {
      this.removeInvalidActions(hasAuthorityChanged);
    }
    if (hasAuthorityChanged) {
      this.authorityGeneration += 1;
      const runIds = this.cancelAllLocally();
      this.clearFailedRunRequests();
      this.toolExecutor.clear?.(undefined, { shouldRetainRevalidatedActions: true });
      this.emitUpdate({ kind: 'walletAuthorityChanged' });
      runIds.forEach((runId) => this.scheduleRemoteCancellation(runId));
    } else if (hasWalletContextChanged) {
      this.emitUpdate({ kind: 'walletContextChanged' });
    }
    return hasAuthorityChanged;
  }

  private removeInvalidActions(shouldRemoveNonRevalidatable: boolean) {
    this.actions.deleteWhere(({ namespace, value }) => {
      const scoped = value as ScopedAction<AgentActionProposal | AgentPersistedActionV2>;
      if (namespace === LIVE_ACTION_NAMESPACE) {
        const action = scoped.action as AgentActionProposal;
        if (!canRevalidateAction(action)) return shouldRemoveNonRevalidatable;
        return this.resolveLiveAction(
          scoped as ScopedAction<AgentActionProposal>,
          scoped.messageId,
        ).kind === 'inactive';
      }
      if (namespace === PERSISTED_ACTION_NAMESPACE) {
        const action = scoped.action as AgentPersistedActionV2;
        if (!canRevalidateAction(action)) return shouldRemoveNonRevalidatable;
        return this.resolvePersistedAction(
          scoped as ScopedAction<AgentPersistedActionV2>,
          scoped.messageId,
        ).kind === 'inactive';
      }
      return shouldRemoveNonRevalidatable;
    });
  }

  async getHints(langCode?: string): Promise<AgentV2Hints> {
    this.assertActive();
    await this.requireConsent();
    const query = langCode ? `?langCode=${encodeURIComponent(langCode)}` : '';
    try {
      const [result] = await Promise.all([
        this.getJson(
          `${this.dependencies.baseUrl}/hints${query}`,
          decodeAgentV2Hints,
        ),
        this.ensureFeatureCapabilities(),
      ]);
      this.assertActive();
      this.serverCapabilitiesReady = true;
      while (true) {
        const host = this.walletSession.snapshot().host;
        await this.ensureFeatureCapabilities();
        this.assertActive();
        if (this.walletSession.snapshot().host !== host) continue;
        const { capabilities } = this.walletSession.buildContext();
        const supportsWalletRead = capabilities.supportedTools.some(({ name, version }) => (
          name === 'wallet.data.query' && version === 5
        ));
        const supportsReceiveAction = capabilities.supportedActions.includes('receive');
        return {
          ...result,
          items: result.items.filter(({ requiredCapabilities }) => (
            !requiredCapabilities || requiredCapabilities.every((requiredCapability) => (
              requiredCapability === 'wallet_read' ? supportsWalletRead : supportsReceiveAction
            ))
          )),
        };
      }
    } catch (error) {
      if (this.lifecycleController.signal.aborted) throw error;
      this.serverCapabilitiesReady = false;
      throw error;
    }
  }

  async getAvailability() {
    this.assertActive();
    await this.requireConsent();
    await this.ensureAvailability();
    this.assertActive();
  }

  async getUserQuota() {
    this.assertActive();
    await this.requireConsent();
    await this.ensureUserQuota();
    this.assertActive();
  }

  private async probeFeatureCapabilities() {
    this.assertActive();
    try {
      const result = await this.getJson(
        `${this.dependencies.baseUrl}/capabilities`,
        decodeAgentV2FeatureCapabilities,
      );
      this.assertActive();
      this.walletSession.updateFeatureCapabilities(
        result.portfolioPositions,
        result.walletQuery,
        result.stakingOffer,
        result.stakingCatalog,
      );
      if (result.walletQuery === 'available') {
        try {
          const walletQuery = await this.getJson(
            `${this.dependencies.baseUrl}/capabilities/wallet-query/v2`,
            decodeAgentV2WalletQueryCapabilitiesV2,
          );
          this.assertActive();
          this.walletSession.updateWalletQueryCapabilities(walletQuery);
        } catch {
          if (this.lifecycleController.signal.aborted) return;
          this.walletSession.updateWalletQueryCapabilities();
        }
      } else {
        this.walletSession.updateWalletQueryCapabilities();
      }
    } catch {
      if (this.lifecycleController.signal.aborted) return;
      this.walletSession.updateFeatureCapabilities();
      this.walletSession.updateWalletQueryCapabilities();
    } finally {
      if (!this.lifecycleController.signal.aborted) {
        this.featureCapabilitiesExpiresAt = (this.dependencies.now?.() ?? Date.now())
          + FEATURE_CAPABILITIES_CACHE_MS;
      }
    }
  }

  async getDefaultThread() {
    this.assertActive();
    await this.requireConsent();
    return this.getJson(`${this.dependencies.baseUrl}/threads/default`, decodeAgentV2DefaultThread);
  }

  async getThread(threadId: string) {
    this.assertActive();
    await this.requireConsent();
    const result = await this.getJson(
      `${this.dependencies.baseUrl}/threads/${encodeURIComponent(threadId)}`,
      decodeAgentV2Thread,
    );
    this.assertThreadBinding(threadId, result.thread.id);
    return result;
  }

  async getMessages(threadId: string, cursorValue?: string, limit = 100): Promise<AgentV2ThreadHydration> {
    this.assertActive();
    await this.requireConsent();
    const authorityGeneration = this.authorityGeneration;
    const walletContextGeneration = this.walletContextGeneration;
    const threadGeneration = this.threadGeneration;
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursorValue) params.set('cursor', cursorValue);
    const page = await this.getJson(
      `${this.dependencies.baseUrl}/threads/${encodeURIComponent(threadId)}/messages?${params}`,
      decodeAgentV2Messages,
    );
    this.assertAuthorityGeneration(authorityGeneration);
    this.assertWalletContextGeneration(walletContextGeneration);
    this.assertThreadBinding(threadId, page.threadId);
    page.messages.forEach((message) => this.assertThreadBinding(threadId, message.threadId));
    const persistedMessages = page.messages;
    const stagedActions: Array<[string, ScopedAction<AgentPersistedActionV2>]> = [];
    for (const message of persistedMessages) {
      for (const action of message.actions ?? []) {
        await this.toolExecutor.hydrateAction?.(threadId, message.id, action);
        this.assertAuthorityGeneration(authorityGeneration);
        this.assertWalletContextGeneration(walletContextGeneration);
        if (threadGeneration !== this.threadGeneration) throw invalidStreamEvent();
        stagedActions.push([actionKey(message.id, action.id), { messageId: message.id, threadId, action }]);
      }
    }
    stagedActions.forEach(([key, scoped]) => {
      this.actions.set(PERSISTED_ACTION_NAMESPACE, key, scoped, { threadId: scoped.threadId });
    });
    const messages = cursorValue
      ? persistedMessages as AgentV2HydratedMessage[]
      : await this.hydrateWalletConversationContexts(
        threadId,
        persistedMessages as AgentV2HydratedMessage[],
        walletContextGeneration,
      );
    this.assertAuthorityGeneration(authorityGeneration);
    this.assertWalletContextGeneration(walletContextGeneration);
    const thread = await this.getThread(threadId);
    this.assertAuthorityGeneration(authorityGeneration);
    this.assertWalletContextGeneration(walletContextGeneration);
    return {
      thread: thread.thread,
      messages,
      nextCursor: page.nextCursor,
      ...(page.incompatibleMessages?.length && {
        incompatibleMessages: page.incompatibleMessages,
      }),
    };
  }

  async startRun(command: AgentV2RunCommand): Promise<AgentV2RunResult> {
    this.assertActive();
    const origin = buildAgentV2RunOrigin(command);
    await this.requireConsent();
    if (command.threadId && command.input.kind !== 'append') this.invalidateThread(command.threadId);
    const clientRunId = this.randomUuid();
    const messageId = command.input.kind === 'regenerate' ? undefined : this.randomUuid();
    await this.ensureServerCapabilities();
    this.assertActive();
    const authorityGeneration = this.authorityGeneration;
    const built = this.walletSession.buildContext();
    const input = command.input.kind === 'append'
      ? { kind: 'append' as const, message: { id: messageId!, text: command.input.text } }
      : command.input.kind === 'edit'
        ? {
          kind: 'edit' as const,
          targetUserMessageId: command.input.targetUserMessageId,
          message: { id: messageId!, text: command.input.text },
        }
        : { kind: 'regenerate' as const, targetAssistantMessageId: command.input.targetAssistantMessageId };
    const walletConversationContext = command.threadId
      && command.walletScopeSelectionOf
      && command.input.kind === 'append'
      ? this.activeWalletConversationContext(command.threadId, built.walletContext)
      : undefined;
    if (
      command.walletScopeSelectionOf
      && walletConversationContext?.sourceAssistantMessageId
      !== command.walletScopeSelectionOf.sourceAssistantMessageId
    ) {
      throw new AgentV2HttpError(
        0,
        'wallet_context_changed',
        'The selected wallet context is no longer available.',
        false,
      );
    }
    const request: AgentRunRequestWireV2 = {
      protocolVersion: 2,
      clientRunId,
      ...(command.threadId ? { threadId: command.threadId } : {}),
      expectedThreadRevision: command.expectedThreadRevision,
      ...origin,
      input,
      context: built.context,
      capabilities: {
        ...built.capabilities,
        ...(this.isAvailabilitySupported ? { supportsAgentCapacityError: true } : {}),
        ...(this.isUserQuotaSupported ? { supportsUserQuotaError: true } : {}),
      },
      walletContext: built.walletContext,
      ...(walletConversationContext ? { walletConversationContext } : {}),
      ...(await this.walletSession.walletBucketHash().then((walletBucketHash) => (
        walletBucketHash ? { walletBucketHash } : {}
      ))),
    };
    await this.requireConsent();
    this.assertAuthorityGeneration(authorityGeneration);
    return this.executeRun(
      request,
      authorityGeneration,
      encodeAgentV2CustomWriterInstructionHeader(command.customWriterInstruction),
    );
  }

  async retryRun(clientRunId: string): Promise<AgentV2RunResult | undefined> {
    this.assertActive();
    await this.requireConsent();
    const authorityGeneration = this.authorityGeneration;
    const failed = this.failedRunRequest?.request.clientRunId === clientRunId
      ? this.failedRunRequest
      : undefined;
    if (!failed) return undefined;
    this.clearFailedRunRequests();
    if (failed.expiresAt <= this.now()) return undefined;
    await this.ensureServerCapabilities();
    this.assertAuthorityGeneration(authorityGeneration);
    await this.requireConsent();
    this.assertAuthorityGeneration(authorityGeneration);
    return this.executeRun(
      failed.request,
      authorityGeneration,
      failed.customWriterInstructionHeader,
    );
  }

  private async executeRun(
    request: AgentRunRequestWireV2,
    authorityGeneration = this.authorityGeneration,
    customWriterInstructionHeader?: string,
  ): Promise<AgentV2RunResult> {
    const inputMessageId = getRunInputMessageId(request);
    const state: RunState = {
      authorityGeneration,
      clientRunId: request.clientRunId,
      request,
      ...(customWriterInstructionHeader ? { customWriterInstructionHeader } : {}),
      controller: new AbortController(),
      binding: { clientRunId: request.clientRunId, lastSequence: 0, rawBySequence: new Map() },
      pendingToolResults: new Map(),
      pendingToolCallIds: new Set(),
      toolActivityByCallId: new Map(),
    };
    this.runs.set(request.clientRunId, state);

    try {
      await this.followRun(state);
      return {
        clientRunId: request.clientRunId,
        runId: state.binding.runId,
        ...(inputMessageId ? { inputMessageId } : {}),
        state: state.outcome ?? 'interrupted',
      };
    } catch (error) {
      if (state.controller.signal.aborted) {
        return {
          clientRunId: request.clientRunId,
          runId: state.binding.runId,
          ...(inputMessageId ? { inputMessageId } : {}),
          state: 'cancelled',
        };
      }
      if (state.binding.lastSequence === 0) {
        const retryExpiresAt = failedRunRequestExpiresAt(error, this.now());
        if (retryExpiresAt !== undefined) {
          this.retainFailedRunRequest(request, retryExpiresAt, customWriterInstructionHeader);
        }
      }
      this.emitFailure(error, state);
      const outcome = error instanceof AgentV2HttpError
        && error.status === 409
        && error.code === 'run_replay_expired'
        ? 'interrupted'
        : 'failed';
      return {
        clientRunId: request.clientRunId,
        runId: state.binding.runId,
        ...(inputMessageId ? { inputMessageId } : {}),
        state: outcome,
      };
    } finally {
      state.pendingToolCallIds.forEach((toolCallId) => this.toolExecutor.discard(toolCallId));
      state.pendingToolCallIds.clear();
      state.pendingToolResults.clear();
      this.runs.delete(request.clientRunId);
      if (this.isRunAuthorityCurrent(state)) {
        if (
          state.outcome === 'completed'
          && (this.isAvailabilitySupported || this.availabilityPromise)
        ) {
          void this.refreshAvailability();
        }
        if (this.isUserQuotaSupported || this.userQuotaPromise) void this.refreshUserQuota();
      }
    }
  }

  async cancelRun(runId: string) {
    this.assertActive();
    const state = [...this.runs.values()].find((candidate) => candidate.binding.runId === runId);
    const clientOperationId = this.randomUuid();
    const response = await this.identity.authenticatedFetch(`${this.dependencies.baseUrl}/runs/${runId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 2, clientOperationId }),
      cache: 'no-store',
      signal: this.lifecycleController.signal,
    }, { shouldSkipUnauthorizedRecovery: true });
    this.assertActive();
    if (!response.ok) throw await decodeHttpError(response);
    const result = decodeAgentV2RunCancel(await response.json());
    this.assertActive();
    this.assertRunBinding(runId, result.runId);
    this.emitUpdate({ kind: 'threadChanged', threadId: result.thread.id, thread: result.thread });
    state?.controller.abort();
    const threadId = state?.threadId ?? state?.request.threadId;
    if (state && threadId) {
      this.emitUpdate({
        kind: 'runCancelled',
        clientRunId: state.clientRunId,
        runId: result.runId,
        threadId,
      });
    }
    return result;
  }

  async clearThread(threadId: string, expectedThreadRevision: number) {
    this.assertActive();
    await this.requireConsent();
    const clientOperationId = this.randomUuid();
    const response = await this.identity.authenticatedFetch(
      `${this.dependencies.baseUrl}/threads/${encodeURIComponent(threadId)}/clear`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocolVersion: 2,
          expectedThreadRevision,
          clientOperationId,
        }),
        cache: 'no-store',
        signal: this.lifecycleController.signal,
      },
    );
    this.assertActive();
    if (!response.ok) throw await decodeHttpError(response);
    const result = decodeAgentV2ThreadClear(await response.json());
    this.assertActive();
    this.assertThreadBinding(threadId, result.thread.id);
    this.abortThreadRuns(threadId);
    this.invalidateThread(threadId);
    this.emitUpdate({ kind: 'threadChanged', threadId: result.thread.id, thread: result.thread });
    return result;
  }

  resolveAction(messageId: string, actionId: string): AgentV2ResolvedAction {
    this.assertActive();
    const key = actionKey(messageId, actionId);
    const live = this.actions.get<ScopedAction<AgentActionProposal>>(LIVE_ACTION_NAMESPACE, key);
    const persisted = this.actions.get<ScopedAction<AgentPersistedActionV2>>(PERSISTED_ACTION_NAMESPACE, key);
    if (live) return this.resolveLiveAction(live, messageId);
    if (persisted) return this.resolvePersistedAction(persisted, messageId);
    return { kind: 'inactive' };
  }

  getActionPresentation(messageId: string, actionId: string): AgentV2ActionPresentation {
    this.assertActive();
    const key = actionKey(messageId, actionId);
    const live = this.actions.get<ScopedAction<AgentActionProposal>>(
      LIVE_ACTION_NAMESPACE,
      key,
    );
    const persisted = this.actions.get<ScopedAction<AgentPersistedActionV2>>(
      PERSISTED_ACTION_NAMESPACE,
      key,
    );
    const scoped = live ?? persisted;
    if (!scoped) return { kind: 'inactive' };
    return this.toolExecutor.getActionPresentation?.(scoped.threadId, messageId, scoped.action)
      ?? { kind: 'inactive' };
  }

  async destroy({
    shouldClearPersistentIdentity = false,
  }: { shouldClearPersistentIdentity?: boolean } = {}) {
    this.lifecycleController.abort();
    const pendingOperations: Promise<unknown>[] = [];
    pendingOperations.push(...this.backgroundTasks);
    if (this.protocolStatePromise) pendingOperations.push(this.protocolStatePromise);
    if (this.consentWritePromise) pendingOperations.push(this.consentWritePromise);
    this.runs.forEach(({ controller }) => controller.abort());
    this.runs.clear();
    this.clearFailedRunRequests();
    this.actions.clear();
    this.walletConversationContexts.clear();
    this.toolExecutor.clear?.(undefined, {
      shouldClearPersistentState: shouldClearPersistentIdentity,
    });
    this.serverCapabilitiesReady = false;
    this.serverCapabilitiesPromise = undefined;
    this.featureCapabilitiesExpiresAt = 0;
    this.featureCapabilitiesPromise = undefined;
    this.clearAvailability();
    this.clearUserQuota();
    const identityDestroy = this.identity.destroy({
      shouldClearPersistentIdentity,
    });
    await Promise.allSettled(pendingOperations);
    await identityDestroy;
    if (shouldClearPersistentIdentity) {
      await this.walletSession.reset({ shouldClearPersistentState: true });
      await Promise.all([
        this.dependencies.storage.removeItem(AGENT_V2_CONSENT_STORAGE_KEY),
        this.walletConversationContextCache?.clear().catch(() => undefined),
      ]);
      this.consentPromise = Promise.resolve(false);
    } else {
      await this.walletSession.flushPersistence();
    }
  }

  async resetProtocolState() {
    this.assertActive();
    this.authorityGeneration += 1;
    this.walletContextGeneration += 1;
    this.runs.forEach(({ controller }) => controller.abort());
    this.runs.clear();
    this.clearFailedRunRequests();
    this.actions.clear();
    this.walletConversationContexts.clear();
    this.toolExecutor.clear?.(undefined, { shouldClearPersistentState: true });
    this.serverCapabilitiesReady = false;
    this.serverCapabilitiesPromise = undefined;
    this.featureCapabilitiesExpiresAt = 0;
    this.featureCapabilitiesPromise = undefined;
    await this.walletSession.reset({ shouldClearPersistentState: true });
    await (this.dependencies.clearWalletSensitiveProtocolState
      ?? clearAgentV2WalletSensitiveProtocolState)();
    this.assertActive();
  }

  private async followRun(state: RunState) {
    let attempt = 0;
    let lastProtocolFailureSequence: number | undefined;
    let protocolFailureCount = 0;
    while (!state.outcome && !state.controller.signal.aborted) {
      try {
        const response = await this.identity.authenticatedFetch(`${this.dependencies.baseUrl}/runs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(state.customWriterInstructionHeader
              ? { [AGENT_V2_CUSTOM_WRITER_INSTRUCTION_HEADER]: state.customWriterInstructionHeader }
              : {}),
          },
          body: JSON.stringify({
            ...state.request,
            ...(state.binding.lastSequence ? { resumeAfterSequence: state.binding.lastSequence } : {}),
          }),
          cache: 'no-store',
          signal: state.controller.signal,
        }, { shouldSkipUnauthorizedRecovery: state.binding.lastSequence !== 0 });
        if (!response.ok) throw await decodeHttpError(response);
        if (!response.body || !response.headers.get('content-type')?.startsWith('application/x-ndjson')) {
          throw invalidStreamEvent();
        }
        logDebug('AgentV2 run stream', {
          stage: 'connected',
          clientRunId: state.clientRunId,
          lastSequence: state.binding.lastSequence,
        });
        for await (const event of parseAgentV2Ndjson(response.body, state.binding)) {
          if (event.type !== 'text_delta') {
            logDebug('AgentV2 run stream', {
              stage: 'event_received',
              clientRunId: state.clientRunId,
              eventType: event.type,
              sequence: event.sequence,
            });
          }
          await this.acceptEvent(event, state);
          attempt = 0;
          lastProtocolFailureSequence = undefined;
          protocolFailureCount = 0;
        }
        if (!state.outcome && !state.controller.signal.aborted) {
          throw new AgentV2StreamTransportError('Agent V2 stream ended before a terminal event');
        }
      } catch (error) {
        if (state.controller.signal.aborted || state.outcome) return;
        logDebugError('AgentV2 run stream', {
          stage: 'read_failed',
          clientRunId: state.clientRunId,
          lastSequence: state.binding.lastSequence,
          attempt: attempt + 1,
        }, error);
        if (error instanceof AgentV2CompatibilityError) {
          logDebug('AgentV2 protocol compatibility', {
            boundary: error.boundary,
            discriminator: error.discriminator,
            version: error.version,
          });
          throw clientUpdateRequired();
        }
        if (error instanceof AgentV2ContractError) throw invalidStreamEvent();
        let isRetryableTransport = false;
        if (error instanceof AgentV2StreamProtocolError) {
          if (!error.retryable) throw invalidStreamEvent();
          if (lastProtocolFailureSequence === state.binding.lastSequence) {
            protocolFailureCount += 1;
          } else {
            lastProtocolFailureSequence = state.binding.lastSequence;
            protocolFailureCount = 1;
          }
          if (protocolFailureCount >= STREAM_PROTOCOL_NO_PROGRESS_MAX_ATTEMPTS) {
            throw invalidStreamEvent();
          }
          isRetryableTransport = true;
        } else if (error instanceof AgentV2HttpError) {
          if (!isRetryableRunHttpError(error)) throw error;
          isRetryableTransport = true;
        } else if (error instanceof AgentV2StreamTransportError || isRetryableRunTransportError(error)) {
          isRetryableTransport = true;
        } else if (isAbortError(error)) {
          throw new AgentV2HttpError(0, 'network_error', 'Agent connection was cancelled.', false);
        } else {
          throw invalidStreamEvent();
        }
        if (!isRetryableTransport) throw invalidStreamEvent();
        attempt += 1;
        if (state.binding.lastSequence === 0 && attempt >= PRE_ADMISSION_MAX_ATTEMPTS) throw error;
        await this.wait(
          Math.min(
            RECONNECT_MAX_DELAY_MS,
            RETRY_BASE_DELAY_MS * 2 ** Math.min(attempt, RECONNECT_BACKOFF_EXPONENT_CAP),
          ),
          state.controller.signal,
        );
      }
    }
  }

  private async acceptEvent(event: AgentStreamEventV2, state: RunState) {
    if (!this.isRunAuthorityCurrent(state) || state.controller.signal.aborted || state.outcome) return;
    if (event.type === 'run_start') {
      if (state.request.threadId && event.threadId !== state.request.threadId) {
        throw new AgentV2HttpError(
          0,
          'invalid_event',
          'Agent stream changed its chat binding.',
          false,
        );
      }
      state.threadId = event.threadId;
      if (state.request.input.kind !== 'append') this.invalidateThread(event.threadId);
    }
    const threadId = state.threadId ?? state.request.threadId;
    if (!threadId) throw new Error('Agent V2 stream event is missing a thread binding');
    const routing = { clientRunId: state.clientRunId, runId: event.runId, threadId };
    if (STRUCTURED_OUTPUT_INVALIDATING_EVENT_TYPES.has(event.type)) {
      this.invalidatePendingStructuredOutput(state);
    }

    switch (event.type) {
      case 'run_start': {
        const inputMessageId = getRunInputMessageId(state.request);
        this.emitUpdate({
          kind: 'runStarted',
          ...routing,
          threadRevision: event.threadRevision,
          ...(inputMessageId ? { inputMessageId } : {}),
        });
        if (this.isUserQuotaSupported || this.userQuotaPromise) void this.refreshUserQuota();
        break;
      }
      case 'thread':
        this.assertThreadBinding(threadId, event.thread.id);
        this.emitUpdate({ kind: 'threadChanged', ...routing, thread: event.thread });
        break;
      case 'message_start':
        state.messageId = event.messageId;
        this.emitUpdate({
          kind: 'messageStarted',
          ...routing,
          messageId: event.messageId,
          contentKind: event.contentKind,
        });
        break;
      case 'text_delta':
        this.emitUpdate({
          kind: 'textDelta',
          ...routing,
          messageId: event.messageId,
          delta: event.delta,
        });
        break;
      case 'message_content_end':
        this.emitUpdate({
          kind: 'messageContentEnded',
          ...routing,
          messageId: event.messageId,
        });
        break;
      case 'tool_call':
        await this.executeTool(event.runId, state, event.toolCall);
        break;
      case 'tool_status': {
        const activity = state.toolActivityByCallId.get(event.toolCallId);
        if (!activity) break;
        this.emitToolActivity({
          ...routing,
          toolCallId: event.toolCallId,
          toolName: activity.name,
          ...(activity.operation ? { operation: activity.operation } : {}),
          status: event.status,
        });
        break;
      }
      case 'run_activity':
        this.emitUpdate({ kind: 'runActivityChanged', ...routing, event });
        break;
      case 'action': {
        const pending = this.getPendingStructuredOutput(state, event.messageId);
        if (pending.isInvalid) break;
        if (pending.actions.some(({ id }) => id === event.action.id)) {
          this.invalidatePendingStructuredOutput(state);
          break;
        }
        pending.actions.push(event.action);
        break;
      }
      case 'followups':
        this.emitUpdate({
          kind: 'followupsAvailable',
          ...routing,
          messageId: event.messageId,
          items: event.items,
        });
        break;
      case 'input_continuations':
        this.emitUpdate({
          kind: 'inputContinuationsAvailable',
          ...routing,
          messageId: event.messageId,
          items: event.items,
        });
        break;
      case 'semantic_content': {
        const pending = this.getPendingStructuredOutput(state, event.messageId);
        if (pending.isInvalid) break;
        if (pending.semanticContent) {
          this.invalidatePendingStructuredOutput(state);
          break;
        }
        pending.semanticContent = event.content;
        break;
      }
      case 'rate_limit':
      case 'error': {
        this.discardPendingStructuredOutput(state);
        state.outcome = 'failed';
        const resetAt = absoluteResetAt(event.resetAt, event.retryAfterMs, this.now());
        if (event.code === 'agent_capacity_exhausted') {
          this.applyLocalCapacityFailure(resetAt);
        }
        this.emitUpdate({
          kind: 'runFailed',
          ...routing,
          code: event.code,
          retryable: event.type === 'rate_limit' || event.retryable,
          ...(event.type === 'error' && event.messageId
            ? { messageId: event.messageId }
            : state.messageId
              ? { messageId: state.messageId }
              : {}),
          ...(resetAt ? { resetAt } : {}),
        });
        break;
      }
      case 'message_end': {
        state.outcome = terminalOutcome(event.finishReason);
        const walletContext = eventWalletConversationContext(event);
        let walletControls: AgentV2WalletConversationControls | undefined;
        const walletAuthority = this.walletSession.snapshot();
        if (
          walletContext
          && walletContext.sourceAssistantMessageId === event.messageId
          && walletContext.sessionId === walletAuthority.sessionId
          && walletContext.revision === walletAuthority.revision
        ) {
          const isReplaced = await this.replaceWalletConversationContext(
            threadId,
            event.messageId,
            walletContext,
            this.walletContextGeneration,
          );
          if (!isReplaced || !this.isRunAuthorityCurrent(state)) return;
          walletControls = deriveWalletConversationControls(walletContext, this.now());
        }
        if (event.finishReason === 'complete' || event.finishReason === 'tool_unavailable') {
          await this.commitPendingStructuredOutput(
            state,
            event.runId,
            threadId,
            event.messageId,
            { shouldPublishActions: event.finishReason === 'complete' },
          );
        } else {
          this.discardPendingStructuredOutput(state);
        }
        this.emitUpdate({
          kind: 'messageCompleted',
          ...routing,
          messageId: event.messageId,
          finishReason: event.finishReason,
          ...(walletControls ? { walletControls } : {}),
        });
        if (event.finishReason === 'cancelled') {
          this.emitUpdate({ kind: 'runCancelled', ...routing });
        }
        break;
      }
    }
  }

  private getPendingStructuredOutput(state: RunState, messageId: string): PendingStructuredOutput {
    if (!state.pendingStructuredOutput) {
      state.pendingStructuredOutput = {
        messageId,
        actions: [],
        isInvalid: state.messageId !== messageId,
      };
    } else if (state.pendingStructuredOutput.messageId !== messageId) {
      this.invalidatePendingStructuredOutput(state);
    }
    return state.pendingStructuredOutput;
  }

  private invalidatePendingStructuredOutput(state: RunState) {
    const pending = state.pendingStructuredOutput;
    if (!pending) return;
    pending.actions.length = 0;
    delete pending.semanticContent;
    pending.isInvalid = true;
  }

  private discardPendingStructuredOutput(state: RunState) {
    state.pendingStructuredOutput = undefined;
  }

  private async commitPendingStructuredOutput(
    state: RunState,
    runId: string,
    threadId: string,
    messageId: string,
    {
      shouldPublishActions = false,
    }: { shouldPublishActions?: boolean } = {},
  ) {
    const pending = state.pendingStructuredOutput;
    state.pendingStructuredOutput = undefined;
    if (
      !this.isRunAuthorityCurrent(state)
      || state.controller.signal.aborted
      || !pending
      || pending.isInvalid
      || pending.messageId !== messageId
      || state.messageId !== messageId
    ) return;

    const routing = { clientRunId: state.clientRunId, runId, threadId };
    if (pending.semanticContent) {
      this.emitUpdate({
        kind: 'semanticContentAvailable',
        ...routing,
        messageId,
        content: pending.semanticContent,
      });
    }
    if (!shouldPublishActions) return;
    for (const action of pending.actions) {
      if (this.lifecycleController.signal.aborted) return;
      const threadGeneration = this.threadGeneration;
      await this.toolExecutor.registerAction?.(threadId, messageId, action);
      if (!this.isRunAuthorityCurrent(state) || threadGeneration !== this.threadGeneration) return;
      this.actions.set(
        LIVE_ACTION_NAMESPACE,
        actionKey(messageId, action.id),
        { messageId, threadId, action } satisfies ScopedAction<AgentActionProposal>,
        { threadId },
      );
      this.emitUpdate({
        kind: 'actionAvailable',
        ...routing,
        messageId,
        action,
      });
    }
  }

  private resolveLiveAction(
    scoped: ScopedAction<AgentActionProposal>,
    messageId: string,
  ): AgentV2ResolvedAction {
    const { action, threadId } = scoped;
    switch (action.kind) {
      case 'send':
      case 'swap':
      case 'hideSpamAssets':
        return this.toolExecutor.resolveAction?.(threadId, messageId, action) ?? { kind: 'inactive' };
      case 'receive':
        return this.resolveLiveReceiveAction(action);
      case 'stake':
        return this.resolveLiveStakeAction(action);
      case 'openUrl':
      case 'openToken':
      case 'openTransaction':
      case 'openAgent':
        return resolveNavigationAction(action, this.walletSession.snapshot().host);
      default:
        return assertUnreachableAction(action);
    }
  }

  private resolvePersistedAction(
    scoped: ScopedAction<AgentPersistedActionV2>,
    messageId: string,
  ): AgentV2ResolvedAction {
    const { action, threadId } = scoped;
    switch (action.kind) {
      case 'send':
      case 'swap':
        return this.toolExecutor.resolvePersistedAction?.(threadId, messageId, action)
          ?? { kind: 'inactive' };
      case 'receive':
        return this.resolveReceiveAction(
          'schemaVersion' in action && action.schemaVersion === 3
            ? action.targetNetwork
            : undefined,
        );
      case 'stake':
        return this.resolveStakeAction(action);
      case 'openSend':
      case 'hideSpamAssets':
        return { kind: 'inactive' };
      case 'openUrl':
      case 'openToken':
      case 'openTransaction':
      case 'openAgent':
        return 'schemaVersion' in action && action.schemaVersion === 3
          ? resolveNavigationAction(action, this.walletSession.snapshot().host)
          : { kind: 'inactive' };
      default:
        return assertUnreachableAction(action);
    }
  }

  private resolveLiveReceiveAction(action: Extract<AgentActionProposal, { kind: 'receive' }>) {
    const snapshot = this.walletSession.snapshot();
    const host = snapshot.host;
    const activeAccount = host?.accounts.find(({ accountId }) => accountId === host.activeAccountId);
    const accountRef = activeAccount ? snapshot.accountRefs.get(activeAccount.accountId) : undefined;
    if (
      action.contextBinding.sessionId !== snapshot.sessionId
      || action.contextBinding.activeAccountRef !== accountRef
      || action.contextBinding.activeNetwork !== host?.activeNetwork
    ) return { kind: 'inactive' } as const;
    const targetNetwork = 'schemaVersion' in action && action.schemaVersion === 3
      ? action.targetNetwork
      : undefined;
    return this.resolveReceiveAction(targetNetwork);
  }

  private resolveLiveStakeAction(action: Extract<AgentActionProposal, { kind: 'stake' }>) {
    const snapshot = this.walletSession.snapshot();
    const host = snapshot.host;
    const activeAccount = host?.accounts.find(({ accountId }) => accountId === host.activeAccountId);
    const accountRef = activeAccount ? snapshot.accountRefs.get(activeAccount.accountId) : undefined;
    if (
      action.contextBinding.sessionId !== snapshot.sessionId
      || action.contextBinding.activeAccountRef !== accountRef
    ) return { kind: 'inactive' } as const;
    return this.resolveStakeAction(action);
  }

  private resolveStakeAction(
    action: Extract<AgentActionProposal | AgentPersistedActionV2, { kind: 'stake' }>,
  ): AgentV2ResolvedAction {
    const host = this.walletSession.snapshot().host;
    const activeAccount = host?.accounts.find(({ accountId }) => accountId === host.activeAccountId);
    if (
      !supportsAgentV2StakingAction(host?.platform)
      || host.isTestnet !== false
      || !activeAccount
      || activeAccount.state !== 'active'
      || activeAccount.isViewOnly
    ) return { kind: 'inactive' };
    const offer = host.stakingOffers?.find((candidate) => (
      candidate.availability === 'available'
      && candidate.productId === action.productId
      && candidate.asset.slug === action.asset.slug
      && candidate.asset.chain === action.asset.chain
      && candidate.asset.symbol === action.asset.symbol
      && candidate.asset.name === action.asset.name
      && candidate.asset.tokenAddress === action.asset.tokenAddress
      && candidate.asset.decimals === action.asset.decimals
    ));
    if (!offer) return { kind: 'inactive' };
    const amount = action.amount;
    if (amount?.kind === 'exact') {
      const fractionLength = amount.value.split('.')[1]?.length ?? 0;
      if (offer.asset.decimals === undefined || fractionLength > offer.asset.decimals || !/[1-9]/u.test(amount.value)) {
        return { kind: 'inactive' };
      }
    }
    return {
      kind: 'openStaking',
      productId: offer.productId,
      tokenSlug: offer.asset.slug,
      ...(amount ? { amount } : {}),
    };
  }

  private resolveReceiveAction(targetNetwork?: AgentApiChain): AgentV2ResolvedAction {
    const snapshot = this.walletSession.snapshot();
    const host = snapshot.host;
    const activeAccount = host?.accounts.find(({ accountId }) => accountId === host.activeAccountId);
    if (!host?.activeNetwork || !activeAccount || activeAccount.state !== 'active') return { kind: 'inactive' };
    const resolvedNetwork = targetNetwork ?? host.activeNetwork;
    if (targetNetwork && targetNetwork !== host.activeNetwork && activeAccount.isViewOnly) {
      return { kind: 'inactive' };
    }
    if (!activeAccount.chains.includes(resolvedNetwork)) return { kind: 'inactive' };
    return { kind: 'openReceive', chain: resolvedNetwork };
  }

  private async hydrateWalletConversationContexts(
    threadId: string,
    messages: AgentV2HydratedMessage[],
    walletContextGeneration = this.walletContextGeneration,
  ): Promise<AgentV2HydratedMessage[]> {
    if (!this.walletConversationContextCache) return messages;
    let latest: {
      index: number;
      context: AgentWalletConversationContextV5;
      controls: AgentV2WalletConversationControls;
    } | undefined;
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (message.role !== 'assistant' || message.content?.kind !== 'semantic') {
        continue;
      }
      const binding = await this.walletContextBinding(threadId, message.id);
      if (!this.isWalletContextGenerationCurrent(walletContextGeneration)) return messages;
      const context = await this.walletConversationContextCache.get(binding).catch(() => undefined);
      if (!this.isWalletContextGenerationCurrent(walletContextGeneration)) {
        this.trackBackgroundTask(
          this.walletConversationContextCache.delete(binding).catch(() => undefined),
        );
        return messages;
      }
      const controls = context ? deriveWalletConversationControls(context, this.now()) : undefined;
      if (context && controls && (!latest || message.createdAt >= messages[latest.index].createdAt)) {
        latest = { index, context, controls };
      }
    }
    if (!latest) return messages;
    if (!this.isWalletContextGenerationCurrent(walletContextGeneration)) return messages;
    this.rememberWalletConversationContext(threadId, messages[latest.index].id, latest.context);
    return messages.map((message, index) => (
      index === latest.index ? { ...message, walletControls: latest.controls } : message
    ));
  }

  private async walletContextBinding(
    threadId: string,
    messageId: string,
  ): Promise<AgentV2WalletContextCacheBinding> {
    const [deviceId, wallet] = await Promise.all([
      this.identity.getDeviceId(),
      this.walletSession.walletAuthorityBinding(),
    ]);
    this.assertActive();
    return {
      ...wallet,
      deviceId,
      threadId,
      messageId,
    };
  }

  private async cacheWalletConversationContext(
    threadId: string,
    messageId: string,
    context: AgentWalletConversationContextV5,
    walletContextGeneration: number,
  ) {
    if (!this.walletConversationContextCache) return true;
    const binding = await this.walletContextBinding(threadId, messageId);
    if (!this.isWalletContextGenerationCurrent(walletContextGeneration)) return false;
    await this.walletConversationContextCache.put(binding, context);
    if (this.isWalletContextGenerationCurrent(walletContextGeneration)) return true;
    this.trackBackgroundTask(
      this.walletConversationContextCache.delete(binding).catch(() => undefined),
    );
    return false;
  }

  private async replaceWalletConversationContext(
    threadId: string,
    messageId: string,
    context: AgentWalletConversationContextV5,
    walletContextGeneration: number,
  ) {
    const previous = this.walletConversationContexts.get<AgentWalletConversationContextV5>(
      WALLET_CONVERSATION_NAMESPACE,
      threadId,
    );
    if (
      previous
      && previous.sourceAssistantMessageId !== messageId
      && this.walletConversationContextCache
    ) {
      const previousBinding = await this.walletContextBinding(
        threadId,
        previous.sourceAssistantMessageId,
      );
      if (!this.isWalletContextGenerationCurrent(walletContextGeneration)) return false;
      await this.walletConversationContextCache.delete(previousBinding).catch(() => undefined);
      if (!this.isWalletContextGenerationCurrent(walletContextGeneration)) return false;
    }
    const isCached = await this.cacheWalletConversationContext(
      threadId,
      messageId,
      context,
      walletContextGeneration,
    ).catch(() => false);
    if (!isCached || !this.isWalletContextGenerationCurrent(walletContextGeneration)) return false;
    this.rememberWalletConversationContext(threadId, messageId, context);
    return true;
  }

  private rememberWalletConversationContext(
    threadId: string,
    messageId: string,
    context: AgentWalletConversationContextV5,
  ) {
    if (context.sourceAssistantMessageId !== messageId) return;
    this.walletConversationContexts.set(
      WALLET_CONVERSATION_NAMESPACE,
      threadId,
      context,
      { expiresAt: Date.parse(context.expiresAt), threadId },
    );
  }

  private activeWalletConversationContext(
    threadId: string,
    walletContext: AgentWalletContextV2,
  ): AgentWalletConversationContextV5 | undefined {
    const context = this.walletConversationContexts.get<AgentWalletConversationContextV5>(
      WALLET_CONVERSATION_NAMESPACE,
      threadId,
    );
    if (!context) return undefined;
    if (
      walletContext.mode !== 'wallet'
      || context.sessionId !== walletContext.sessionId
      || context.revision !== walletContext.revision
      || Date.parse(context.expiresAt) <= this.now()
    ) {
      this.walletConversationContexts.delete(WALLET_CONVERSATION_NAMESPACE, threadId);
      return undefined;
    }
    return context;
  }

  private async executeTool(runId: string, state: RunState, call: AgentToolCall) {
    const threadId = state.threadId ?? state.request.threadId;
    if (!threadId) throw new Error('Agent V2 tool call is missing a thread binding');
    const currentUserMessageId = state.request.input.kind === 'regenerate'
      ? undefined
      : state.request.input.message.id;
    if (call.scopeIntent && call.scopeIntent.messageId !== currentUserMessageId) {
      throw invalidStreamEvent();
    }
    const operation = call.name === 'wallet.data.query'
      ? call.arguments.operation
      : undefined;
    const currentActivity = state.toolActivityByCallId.get(call.id);
    if (
      currentActivity
      && (currentActivity.name !== call.name || currentActivity.operation !== operation)
    ) throw invalidStreamEvent();
    state.toolActivityByCallId.set(call.id, {
      name: call.name,
      ...(operation ? { operation } : {}),
    });
    state.pendingToolCallIds.add(call.id);
    logDebug('AgentV2 tool lifecycle', {
      stage: 'received',
      runId,
      toolCallId: call.id,
      toolName: call.name,
      timeoutMs: call.timeoutMs,
    });
    let result = state.pendingToolResults.get(call.id);
    if (!result) {
      const messageId = state.request.walletScopeSelectionOf?.sourceAssistantMessageId
        ?? state.request.walletConversationContext?.sourceAssistantMessageId
        ?? state.messageId
        ?? call.intentSource?.messageId
        ?? currentUserMessageId;
      if (!messageId) throw invalidStreamEvent();
      this.emitToolActivity({
        clientRunId: state.clientRunId,
        runId,
        threadId,
        toolCallId: call.id,
        toolName: call.name,
        ...(operation ? { operation } : {}),
        status: 'running',
      });
      result = await this.executeToolWithinDeadline(call, {
        messageId,
        runId,
        threadId,
      }, state.controller.signal);
      if (!this.isRunAuthorityCurrent(state)) return;
      logDebug('AgentV2 tool lifecycle', {
        stage: 'executed',
        runId,
        toolCallId: call.id,
        toolName: call.name,
        status: result.status,
      });
      state.pendingToolResults.set(call.id, result);
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < TOOL_RESULT_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await this.identity.authenticatedFetch(
          `${this.dependencies.baseUrl}/runs/${runId}/tool-results`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result),
            cache: 'no-store',
            signal: state.controller.signal,
          },
          { shouldSkipUnauthorizedRecovery: true },
        );
        if (!response.ok) throw await decodeHttpError(response);
        const acknowledgement = decodeAgentV2ToolResultAck(await response.json());
        if (!this.isRunAuthorityCurrent(state) || state.controller.signal.aborted) {
          throw state.controller.signal.reason ?? new DOMException('Aborted', 'AbortError');
        }
        this.assertRunBinding(runId, acknowledgement.runId);
        if (
          acknowledgement.toolCallId !== call.id
          || acknowledgement.clientToolResultId !== result.clientToolResultId
        ) {
          throw new AgentV2HttpError(
            0,
            'invalid_event',
            'Agent tool acknowledgement changed its request binding.',
            false,
          );
        }
        state.pendingToolResults.delete(call.id);
        state.pendingToolCallIds.delete(call.id);
        logDebug('AgentV2 tool lifecycle', {
          stage: 'acknowledged',
          runId,
          toolCallId: call.id,
          toolName: call.name,
          status: result.status,
        });
        return;
      } catch (error) {
        lastError = error;
        logDebugError('AgentV2 tool result submission', {
          stage: 'failed',
          attempt: attempt + 1,
          runId,
          toolCallId: call.id,
          toolName: call.name,
        }, error);
        if (state.controller.signal.aborted || (error instanceof AgentV2HttpError && !error.retryable)) break;
        await this.wait(RETRY_BASE_DELAY_MS * (attempt + 1), state.controller.signal);
      }
    }
    throw lastError;
  }

  private emitToolActivity(update: Omit<
    Extract<AgentV2ClientUpdate, { kind: 'toolActivityChanged' }>,
    'kind'
  >) {
    try {
      this.emitUpdate({ kind: 'toolActivityChanged', ...update });
    } catch (error) {
      // Tool progress is presentational and must not interrupt the tool-result protocol.
      logDebugError('AgentV2 tool progress update', {
        runId: update.runId,
        toolCallId: update.toolCallId,
        toolName: update.toolName,
        status: update.status,
      }, error);
    }
  }

  private executeToolWithinDeadline(
    call: AgentToolCall,
    context: Omit<AgentV2ToolExecutionContext, 'deviceId' | 'signal'>,
    parentSignal: AbortSignal,
  ): Promise<AgentToolResultRequestV2> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      let hasTimedOut = false;
      let isSettled = false;
      const timeout = setTimeout(() => {
        if (isSettled) return;
        hasTimedOut = true;
        isSettled = true;
        dispose();
        resolve(this.createToolTimeoutResult(call, context));
        logDebugError('AgentV2 tool lifecycle', {
          stage: 'timeout',
          runId: context.runId,
          toolCallId: call.id,
          toolName: call.name,
          timeoutMs: call.timeoutMs,
        });
        controller.abort(new DOMException('Tool execution timed out.', 'TimeoutError'));
        this.toolExecutor.discard(call.id);
      }, getAgentToolExecutionTimeout(call.timeoutMs));
      const handleParentAbort = () => {
        if (isSettled) return;
        isSettled = true;
        dispose();
        controller.abort(parentSignal.reason);
        reject(parentSignal.reason ?? new DOMException('Aborted', 'AbortError'));
      };
      const dispose = () => {
        clearTimeout(timeout);
        parentSignal.removeEventListener('abort', handleParentAbort);
      };

      if (parentSignal.aborted) {
        handleParentAbort();
        return;
      }
      parentSignal.addEventListener('abort', handleParentAbort, { once: true });
      const execution = this.identity.getDeviceId(controller.signal).then((deviceId) => {
        if (controller.signal.aborted) {
          throw controller.signal.reason ?? new DOMException('Aborted', 'AbortError');
        }
        logDebug('AgentV2 tool lifecycle', {
          stage: 'identity_ready',
          runId: context.runId,
          toolCallId: call.id,
          toolName: call.name,
        });
        return this.toolExecutor.execute(call, {
          ...context,
          deviceId,
          signal: controller.signal,
        });
      });
      execution.then((toolResult) => {
        if (hasTimedOut) {
          this.toolExecutor.discard(call.id);
          return;
        }
        if (isSettled) return;
        isSettled = true;
        dispose();
        resolve(toolResult);
      }, (error) => {
        if (hasTimedOut) {
          this.toolExecutor.discard(call.id);
          return;
        }
        if (isSettled) return;
        isSettled = true;
        dispose();
        logDebugError('AgentV2 tool lifecycle', {
          stage: 'rejected',
          runId: context.runId,
          toolCallId: call.id,
          toolName: call.name,
        }, error);
        reject(error);
      });
    });
  }

  private createToolTimeoutResult(
    call: AgentToolCall,
    context: Omit<AgentV2ToolExecutionContext, 'deviceId' | 'signal'>,
  ): AgentToolResultRequestV2 {
    return {
      protocolVersion: 2,
      runId: context.runId,
      threadId: context.threadId,
      toolCallId: call.id,
      clientToolResultId: this.randomUuid(),
      completedAt: new Date(this.now()).toISOString(),
      ...toolResultSessionBinding(call),
      status: 'error',
      error: {
        code: 'tool_timeout',
        retryable: true,
      },
    };
  }

  private async getJson<T>(url: string, decoder: (value: unknown) => T, init: RequestInit = {}): Promise<T> {
    this.assertActive();
    const response = await this.identity.authenticatedFetch(url, {
      ...init,
      cache: 'no-store',
      signal: this.lifecycleController.signal,
    });
    this.assertActive();
    if (!response.ok) throw await decodeHttpError(response);
    const result = decoder(await response.json());
    this.assertActive();
    return result;
  }

  private async ensureServerCapabilities(): Promise<void> {
    if (!this.serverCapabilitiesReady && !this.serverCapabilitiesPromise) {
      const langCode = this.walletSession.snapshot().host?.lang;
      const pending = this.getHints(langCode).then(
        () => undefined,
        () => undefined,
      ).finally(() => {
        if (this.serverCapabilitiesPromise === pending) {
          this.serverCapabilitiesPromise = undefined;
        }
      });
      this.serverCapabilitiesPromise = pending;
    }
    await Promise.all([
      this.serverCapabilitiesPromise,
      this.ensureFeatureCapabilities(),
    ]);
  }

  private ensureFeatureCapabilities(): Promise<void> {
    const host = this.walletSession.snapshot().host;
    const shouldProbeFeatureCapabilities = host?.platform === 'classic' || host?.platform === 'ios';
    const now = this.dependencies.now?.() ?? Date.now();
    if (
      shouldProbeFeatureCapabilities
      && now >= this.featureCapabilitiesExpiresAt
      && !this.featureCapabilitiesPromise
    ) {
      const pending = this.probeFeatureCapabilities().finally(() => {
        if (this.featureCapabilitiesPromise === pending) {
          this.featureCapabilitiesPromise = undefined;
        }
      });
      this.featureCapabilitiesPromise = pending;
    }
    return this.featureCapabilitiesPromise ?? Promise.resolve();
  }

  private ensureAvailability(): Promise<void> {
    if (this.isAvailabilitySupported === false) return Promise.resolve();
    if (!this.availabilityPromise) {
      const pending = this.probeAvailability().finally(() => {
        if (this.availabilityPromise === pending) this.availabilityPromise = undefined;
      });
      this.availabilityPromise = pending;
    }
    return this.availabilityPromise;
  }

  private ensureUserQuota(): Promise<void> {
    if (this.isUserQuotaSupported === false) return Promise.resolve();
    if (!this.userQuotaPromise) {
      const pending = this.probeUserQuota().finally(() => {
        if (this.userQuotaPromise === pending) this.userQuotaPromise = undefined;
      });
      this.userQuotaPromise = pending;
    }
    return this.userQuotaPromise;
  }

  private refreshAvailability(): Promise<void> {
    if (this.lifecycleController.signal.aborted) return Promise.resolve();
    if (this.isAvailabilitySupported === false) return Promise.resolve();
    const availabilityGeneration = ++this.availabilityGeneration;
    const previous = this.availabilityPromise ?? Promise.resolve();
    const pending = previous.then(() => {
      if (
        this.isAvailabilitySupported === false
        || availabilityGeneration !== this.availabilityGeneration
      ) return;
      return this.probeAvailability(availabilityGeneration);
    }).finally(() => {
      if (this.availabilityPromise === pending) this.availabilityPromise = undefined;
    });
    this.availabilityPromise = pending;
    return pending;
  }

  private refreshUserQuota(): Promise<void> {
    if (this.lifecycleController.signal.aborted) return Promise.resolve();
    if (this.isUserQuotaSupported === false) return Promise.resolve();
    const previous = this.userQuotaPromise ?? Promise.resolve();
    const pending = previous.then(() => {
      if (this.isUserQuotaSupported === false) return;
      return this.probeUserQuota();
    }).finally(() => {
      if (this.userQuotaPromise === pending) this.userQuotaPromise = undefined;
    });
    this.userQuotaPromise = pending;
    return pending;
  }

  private async probeUserQuota() {
    if (this.lifecycleController.signal.aborted) return;
    try {
      const response = await this.identity.authenticatedFetch(`${this.dependencies.baseUrl}/quota`, {
        cache: 'no-store',
        signal: this.lifecycleController.signal,
      });
      this.assertActive();
      if (response.status === 404) {
        this.isUserQuotaSupported = false;
        this.applyUserQuota();
        return;
      }
      if (!response.ok) throw await decodeHttpError(response);
      this.isUserQuotaSupported = true;
      const result = decodeAgentV2UserQuota(await response.json());
      this.assertActive();
      this.applyUserQuota(result);
    } catch {
      // Admission remains authoritative if the optional quota probe is temporarily unreachable.
    }
  }

  private applyUserQuota(response?: AgentUserQuotaResponseV2) {
    if (this.lifecycleController.signal.aborted) return;
    if (this.userQuotaTimer) {
      clearTimeout(this.userQuotaTimer);
      this.userQuotaTimer = undefined;
    }
    if (!response) {
      this.emitUpdate({ kind: 'userQuotaChanged' });
      return;
    }

    const { quota } = response;
    this.emitUpdate({ kind: 'userQuotaChanged', quota });
    if (this.lifecycleController.signal.aborted) return;
    const resetAt = Date.parse(quota.resetAt);
    if (!Number.isFinite(resetAt)) return;
    this.userQuotaTimer = setTimeout(() => {
      if (this.lifecycleController.signal.aborted) return;
      this.userQuotaTimer = undefined;
      this.applyUserQuota({
        protocolVersion: 2,
        quota: {
          limit: quota.limit,
          used: 0,
          remaining: quota.limit,
          resetAt: new Date(resetAt + UTC_DAY_MS).toISOString(),
        },
      });
      void this.probeUserQuota();
    }, Math.min(Math.max(0, resetAt - this.now()), MAX_TIMER_DELAY_MS));
  }

  private async probeAvailability(availabilityGeneration = this.availabilityGeneration) {
    if (
      this.lifecycleController.signal.aborted
      || availabilityGeneration !== this.availabilityGeneration
    ) return;
    try {
      const response = await this.identity.authenticatedFetch(`${this.dependencies.baseUrl}/availability`, {
        cache: 'no-store',
        signal: this.lifecycleController.signal,
      });
      this.assertActive();
      if (availabilityGeneration !== this.availabilityGeneration) return;
      if (response.status === 404) {
        this.isAvailabilitySupported = false;
        this.applyAvailability({ protocolVersion: 2, state: 'available' });
        return;
      }
      if (!response.ok) throw await decodeHttpError(response);
      const result = decodeAgentV2Availability(await response.json());
      this.assertActive();
      if (availabilityGeneration !== this.availabilityGeneration) return;
      this.isAvailabilitySupported = true;
      this.applyAvailability(result);
    } catch {
      // Admission remains authoritative if the optional availability probe is temporarily unreachable.
    }
  }

  private applyAvailability(availability: AgentAvailabilityResponseV2) {
    if (this.lifecycleController.signal.aborted) return;
    if (this.availabilityTimer) {
      clearTimeout(this.availabilityTimer);
      this.availabilityTimer = undefined;
    }
    if (availability.state === 'available') {
      this.emitUpdate({ kind: 'availabilityChanged', availability: { state: 'available' } });
      return;
    }
    const resetAt = absoluteResetAt(availability.resetAt, undefined, this.now());
    this.emitUpdate({
      kind: 'availabilityChanged',
      availability: {
        state: 'capacity_exhausted',
        ...(resetAt ? { resetAt } : {}),
      },
    });
    if (this.lifecycleController.signal.aborted) return;
    if (!resetAt) return;
    this.availabilityTimer = setTimeout(() => {
      if (this.lifecycleController.signal.aborted) return;
      const availabilityGeneration = ++this.availabilityGeneration;
      this.availabilityTimer = undefined;
      this.emitUpdate({ kind: 'availabilityChanged', availability: { state: 'available' } });
      void this.probeAvailability(availabilityGeneration);
    }, Math.min(Math.max(0, resetAt - this.now()), MAX_TIMER_DELAY_MS));
  }

  private applyLocalCapacityFailure(resetAt?: number) {
    this.availabilityGeneration += 1;
    this.applyAvailability({
      protocolVersion: 2,
      state: 'capacity_exhausted',
      ...(resetAt ? { resetAt: new Date(resetAt).toISOString() } : {}),
    });
  }

  private clearAvailability() {
    this.availabilityGeneration += 1;
    if (this.availabilityTimer) clearTimeout(this.availabilityTimer);
    this.availabilityTimer = undefined;
    this.availabilityPromise = undefined;
    this.isAvailabilitySupported = undefined;
    this.emitUpdate({ kind: 'availabilityChanged', availability: { state: 'available' } });
  }

  private retainFailedRunRequest(
    request: AgentRunRequestWireV2,
    expiresAt: number,
    customWriterInstructionHeader?: string,
  ) {
    this.clearFailedRunRequests();
    const failedRunRequest = {
      request,
      expiresAt,
      ...(customWriterInstructionHeader ? { customWriterInstructionHeader } : {}),
    };
    this.failedRunRequest = failedRunRequest;
    this.failedRunRequestTimer = setTimeout(() => {
      this.failedRunRequestTimer = undefined;
      if (this.failedRunRequest === failedRunRequest) this.failedRunRequest = undefined;
    }, Math.max(0, expiresAt - this.now()));
  }

  private clearFailedRunRequests() {
    if (this.failedRunRequestTimer !== undefined) clearTimeout(this.failedRunRequestTimer);
    this.failedRunRequestTimer = undefined;
    this.failedRunRequest = undefined;
  }

  private clearUserQuota() {
    if (this.userQuotaTimer) clearTimeout(this.userQuotaTimer);
    this.userQuotaTimer = undefined;
    this.userQuotaPromise = undefined;
    this.isUserQuotaSupported = undefined;
    this.emitUpdate({ kind: 'userQuotaChanged' });
  }

  private now() {
    return this.dependencies.now?.() ?? Date.now();
  }

  private emitUpdate(update: AgentV2ClientUpdate) {
    if (this.lifecycleController.signal.aborted) return;
    this.dependencies.onUpdate(update);
  }

  private assertActive() {
    if (this.lifecycleController.signal.aborted) throw new Error('Agent V2 runtime is destroyed');
  }

  private async requireConsent() {
    this.assertActive();
    if (!await this.getConsent()) throw new Error('Agent V2 consent is required');
    this.assertActive();
  }

  private ensureProtocolState() {
    this.protocolStatePromise ??= this.initializeProtocolState();
    return this.protocolStatePromise;
  }

  private async initializeProtocolState() {
    this.assertActive();
    const version = await this.dependencies.storage.getItem(WALLET_PROTOCOL_STORAGE_KEY);
    this.assertActive();
    if (version === WALLET_PROTOCOL_VERSION) return;
    await this.resetProtocolState();
    this.assertActive();
    await this.dependencies.storage.setItem(WALLET_PROTOCOL_STORAGE_KEY, WALLET_PROTOCOL_VERSION);
    this.assertActive();
  }

  private async readConsent() {
    const stored = await this.dependencies.storage.getItem(AGENT_V2_CONSENT_STORAGE_KEY);
    this.assertActive();
    try {
      const record = typeof stored === 'string'
        ? JSON.parse(stored) as { version?: unknown; accepted?: unknown }
        : stored;
      return record?.version === 2 && record.accepted === true;
    } catch {
      return false;
    }
  }

  private cancelAllLocally() {
    const states = [...this.runs.values()];
    const runIds = states
      .flatMap(({ binding }) => binding.runId ? [binding.runId] : []);
    states.forEach((state) => {
      state.outcome = 'cancelled';
      state.controller.abort();
      state.pendingToolCallIds.forEach((toolCallId) => this.toolExecutor.discard(toolCallId));
      state.pendingToolCallIds.clear();
      state.pendingToolResults.clear();
    });
    return runIds;
  }

  private scheduleRemoteCancellation(runId: string) {
    this.trackBackgroundTask(this.cancelRunRemotely(runId).catch((error) => {
      if (this.lifecycleController.signal.aborted) return;
      logDebugError('AgentV2 run cancellation', { runId, stage: 'authority_change' }, error);
    }));
  }

  private async cancelRunRemotely(runId: string) {
    const controller = new AbortController();
    const handleLifecycleAbort = () => controller.abort(this.lifecycleController.signal.reason);
    const timeout = setTimeout(() => {
      controller.abort(new DOMException('Agent run cancellation timed out.', 'TimeoutError'));
    }, REMOTE_CANCEL_TIMEOUT_MS);
    if (this.lifecycleController.signal.aborted) {
      handleLifecycleAbort();
    } else {
      this.lifecycleController.signal.addEventListener('abort', handleLifecycleAbort, { once: true });
    }
    try {
      const response = await this.identity.authenticatedFetch(
        `${this.dependencies.baseUrl}/runs/${runId}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ protocolVersion: 2, clientOperationId: this.randomUuid() }),
          cache: 'no-store',
          signal: controller.signal,
        },
        { shouldSkipUnauthorizedRecovery: true },
      );
      if (!response.ok) throw await decodeHttpError(response);
      const result = decodeAgentV2RunCancel(await response.json());
      this.assertRunBinding(runId, result.runId);
      this.emitUpdate({ kind: 'threadChanged', threadId: result.thread.id, thread: result.thread });
    } finally {
      clearTimeout(timeout);
      this.lifecycleController.signal.removeEventListener('abort', handleLifecycleAbort);
    }
  }

  private trackBackgroundTask(task: Promise<void>) {
    this.backgroundTasks.add(task);
    void task.then(
      () => this.backgroundTasks.delete(task),
      () => this.backgroundTasks.delete(task),
    );
  }

  private isRunAuthorityCurrent(state: RunState) {
    return this.isAuthorityGenerationCurrent(state.authorityGeneration);
  }

  private isAuthorityGenerationCurrent(authorityGeneration: number) {
    return !this.lifecycleController.signal.aborted && authorityGeneration === this.authorityGeneration;
  }

  private assertAuthorityGeneration(authorityGeneration: number) {
    if (authorityGeneration === this.authorityGeneration) return;
    throw new AgentV2HttpError(
      0,
      'wallet_context_changed',
      'The active wallet changed.',
      false,
    );
  }

  private isWalletContextGenerationCurrent(walletContextGeneration: number) {
    return !this.lifecycleController.signal.aborted
      && walletContextGeneration === this.walletContextGeneration;
  }

  private assertWalletContextGeneration(walletContextGeneration: number) {
    if (this.isWalletContextGenerationCurrent(walletContextGeneration)) return;
    throw new AgentV2HttpError(
      0,
      'wallet_context_changed',
      'The wallet context changed.',
      false,
    );
  }

  private invalidateThread(threadId: string) {
    this.threadGeneration += 1;
    const failedRunRequest = this.failedRunRequest;
    if (failedRunRequest?.request.threadId === threadId) this.clearFailedRunRequests();
    this.actions.deleteWhere((entry) => entry.threadId === threadId);
    this.toolExecutor.clear?.(threadId);
    this.walletConversationContexts.delete(WALLET_CONVERSATION_NAMESPACE, threadId);
    this.emitUpdate({ kind: 'walletAuthorityChanged', threadId });
  }

  private deleteRetainedWalletConversationContext(
    threadId: string,
    context: AgentWalletConversationContextV5,
  ) {
    if (!this.walletConversationContextCache) return;
    const walletContextGeneration = this.walletContextGeneration;
    this.trackBackgroundTask(
      this.walletContextBinding(threadId, context.sourceAssistantMessageId)
        .then((binding) => {
          if (!this.isWalletContextGenerationCurrent(walletContextGeneration)) return;
          return this.walletConversationContextCache!.delete(binding);
        })
        .catch(() => undefined),
    );
  }

  private assertThreadBinding(expectedThreadId: string, actualThreadId: string) {
    if (actualThreadId !== expectedThreadId) {
      throw new AgentV2HttpError(
        0,
        'invalid_event',
        'Agent response changed its chat binding.',
        false,
      );
    }
  }

  private assertRunBinding(expectedRunId: string, actualRunId: string) {
    if (actualRunId !== expectedRunId) {
      throw new AgentV2HttpError(
        0,
        'invalid_event',
        'Agent response changed its run binding.',
        false,
      );
    }
  }

  private abortThreadRuns(threadId: string) {
    this.runs.forEach((state) => {
      if ((state.threadId ?? state.request.threadId) === threadId) state.controller.abort();
    });
  }

  private emitFailure(error: unknown, state: RunState) {
    if (!this.isRunAuthorityCurrent(state)) return;
    const safe = error instanceof AgentV2HttpError
      ? error
      : invalidStreamEvent();
    const resetAt = absoluteResetAt(safe.resetAt, safe.retryAfterMs, this.now());
    const failure = {
      kind: 'runFailed',
      clientRunId: state.clientRunId,
      code: safe.code,
      retryable: safe.retryable,
      ...(state.messageId ? { messageId: state.messageId } : {}),
      ...(resetAt ? { resetAt } : {}),
    } as const;
    if (safe.code === 'agent_capacity_exhausted') {
      this.applyLocalCapacityFailure(resetAt);
    }
    if (safe.code === 'user_quota_exhausted' && safe.quota) {
      this.applyUserQuota({ protocolVersion: 2, quota: safe.quota });
    }
    const threadId = state.threadId ?? state.request.threadId;

    if (state.binding.runId && threadId) {
      this.emitUpdate({ ...failure, runId: state.binding.runId, threadId });
    } else {
      this.emitUpdate({ ...failure, ...(threadId ? { threadId } : {}) });
    }
  }
}

class UnsupportedToolExecutor implements AgentV2ToolExecutor {
  constructor(private readonly randomUuid: () => string) {}

  execute(toolCall: AgentToolCall, context: AgentV2ToolExecutionContext): Promise<AgentToolResultRequestV2> {
    return Promise.resolve({
      protocolVersion: 2,
      runId: context.runId,
      threadId: context.threadId,
      toolCallId: toolCall.id,
      clientToolResultId: this.randomUuid(),
      completedAt: new Date().toISOString(),
      ...toolResultSessionBinding(toolCall),
      status: 'rejected',
      error: {
        code: 'tool_unsupported',
        retryable: false,
      },
    });
  }

  discard() {}
}

function toolResultSessionBinding(call: AgentToolCall) {
  return call.name === 'wallet.directory.query'
    ? { toolName: call.name, directorySession: call.directorySession }
    : { toolName: call.name, walletContextSession: call.walletContextSession };
}

function actionKey(messageId: string, actionId: string) {
  return `${messageId}:${actionId}`;
}

function canRevalidateAction(action: AgentActionProposal | AgentPersistedActionV2) {
  return action.kind === 'receive'
    || action.kind === 'stake'
    || action.kind === 'swap'
    || action.kind === 'send';
}

type ResolvableNavigationAction =
  | Extract<AgentActionProposal, { kind: 'openUrl' | 'openToken' | 'openTransaction' | 'openAgent' }>
  | AgentPersistedNavigationActionV3;

function resolveNavigationAction(
  action: ResolvableNavigationAction,
  host?: AgentV2HostContextSnapshot,
): AgentV2ResolvedAction {
  switch (action.kind) {
    case 'openUrl':
      return isSafeHttpsUrl(action.url) ? { kind: 'openUrl', url: action.url } : { kind: 'inactive' };
    case 'openToken':
      return isKnownNavigationAsset(host, action)
        ? {
          kind: 'openToken',
          slug: action.slug,
          chain: action.chain,
          ...(action.tokenAddress ? { tokenAddress: action.tokenAddress } : {}),
        }
        : { kind: 'inactive' };
    case 'openTransaction':
      return getIsSupportedChain(action.chain) && Boolean(action.transactionRef.trim())
        ? { kind: 'openTransaction', chain: action.chain, transactionRef: action.transactionRef }
        : { kind: 'inactive' };
    case 'openAgent':
      return isSafeEntryPoint(action.entryPoint, host)
        ? { kind: 'openAgent', entryPoint: action.entryPoint }
        : { kind: 'inactive' };
    default:
      return assertUnreachableAction(action);
  }
}

function isKnownNavigationAsset(
  host: AgentV2HostContextSnapshot | undefined,
  target: { slug: string; chain: string; tokenAddress?: string },
) {
  if (!getIsSupportedChain(target.chain)) return false;
  const assets = [
    ...(host?.assetCatalog ?? []),
    ...(host?.accounts.flatMap(({ holdings }) => holdings.map(({ asset }) => asset)) ?? []),
  ];
  return assets.some((asset) => (
    asset.slug === target.slug
    && asset.chain === target.chain
    && (target.tokenAddress === undefined || asset.tokenAddress === target.tokenAddress)
  ));
}

function isSafeEntryPoint(
  entryPoint: AgentEntryPoint,
  host?: AgentV2HostContextSnapshot,
) {
  switch (entryPoint.kind) {
    case 'agentTab':
      return true;
    case 'portfolioChart':
      return !entryPoint.datasetFocus?.chain
        || getIsSupportedChain(entryPoint.datasetFocus.chain);
    case 'tokenScreen':
      return isKnownNavigationAsset(host, entryPoint.asset);
    case 'globalSearch':
      return Boolean(entryPoint.query.trim());
    case 'emptyState':
      return entryPoint.surface === 'agentTab';
    default:
      return assertUnreachableAction(entryPoint);
  }
}

function isSafeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function assertUnreachableAction(value: never): never {
  throw new Error(`Unexpected Agent V2 action: ${String(value)}`);
}

function eventWalletConversationContext(
  event: AgentMessageEndEvent,
): AgentWalletConversationContextV5 | undefined {
  const context = (event as typeof event & { walletConversationContext?: unknown }).walletConversationContext;
  return context ? decodeAgentV2WalletConversationContextV5(context) : undefined;
}

function deriveWalletConversationControls(
  context: AgentWalletConversationContextV5,
  now: number,
): AgentV2WalletConversationControls | undefined {
  const isContextLive = Date.parse(context.expiresAt) > now;
  return {
    expiresAt: context.expiresAt,
    scopeChoices: isContextLive
      ? context.scopeChoices.map(({ choiceId, label }) => ({ choiceId, label }))
      : [],
  };
}

function terminalOutcome(finishReason: AgentMessageEndEvent['finishReason']) {
  if (finishReason === 'cancelled') return 'cancelled' as const;
  if (finishReason === 'run_interrupted') return 'interrupted' as const;
  if (finishReason === 'error' || finishReason === 'rate_limited') return 'failed' as const;
  return 'completed' as const;
}

function getRunInputMessageId(request: AgentRunRequestWireV2) {
  return request.input.kind === 'regenerate' ? undefined : request.input.message.id;
}

function invalidStreamEvent() {
  return new AgentV2HttpError(
    0,
    'invalid_event',
    'Agent stream returned an invalid event.',
    false,
  );
}

function clientUpdateRequired() {
  return new AgentV2HttpError(
    0,
    'client_update_required',
    'Update the app to continue.',
    false,
  );
}

function absoluteResetAt(resetAt: string | undefined, retryAfterMs: number | undefined, now: number) {
  if (resetAt) {
    const timestamp = Date.parse(resetAt);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return retryAfterMs ? now + retryAfterMs : undefined;
}

function failedRunRequestExpiresAt(error: unknown, now: number) {
  if (error instanceof AgentV2HttpError) {
    const isLimitFailure = error.code === 'rate_limited' || error.code === 'user_quota_exhausted';
    if (!isLimitFailure && !isRetryableRunHttpError(error)) return undefined;
    const resetAt = absoluteResetAt(error.resetAt, error.retryAfterMs, now) ?? now;
    return Math.min(resetAt + FAILED_RUN_RETRY_GRACE_MS, now + FAILED_RUN_RETRY_MAX_TTL_MS);
  }
  if (error instanceof AgentV2StreamTransportError || isRetryableRunTransportError(error)) {
    return now + FAILED_RUN_RETRY_GRACE_MS;
  }
  return undefined;
}

function isRetryableRunHttpError(error: AgentV2HttpError) {
  if (error.status === 408 || error.status >= 500) return true;
  return error.status === 0 && error.retryable;
}

function isRetryableRunTransportError(error: unknown) {
  if (error instanceof DOMException) return error.name === 'NetworkError' || error.name === 'TimeoutError';
  return error instanceof TypeError
    && /failed to fetch|fetch failed|load failed|networkerror|offline/iu.test(error.message);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
