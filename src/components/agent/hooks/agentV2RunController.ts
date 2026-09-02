import type {
  AgentErrorCodeV2,
  AgentPublicFollowUpV2,
  AgentPublicInputContinuationV1,
  AgentThreadClearResponseV2,
  AgentThreadSummaryV2,
} from '../../../api/agentV2/protocol/types';
import type {
  AgentV2ClientUpdate,
  AgentV2MutationResult,
  AgentV2RunCommand,
  AgentV2RunCommandInput,
  AgentV2RunResult,
  AgentV2WalletConversationControl,
} from '../../../api/agentV2/types';
import type { AgentHint } from '../../../global/types';
import type {
  AgentV2MessagesState,
  AgentV2MessagesStateAction,
} from './agentV2MessagesState';
import type { AgentV2StreamController } from './agentV2StreamController';

import {
  isAgentV2ComposerBlocked,
  selectAgentV2ComposerStatus,
} from '../../agentV2/agentComposerStatus';
import {
  selectIsAgentV2InputDisabled,
  selectIsAgentV2RunActive,
} from './agentV2MessagesState';

type AgentV2RunAdmission =
  | { kind: 'append'; messageId: number }
  | { kind: 'edit'; targetMessageId: number; text: string }
  | { kind: 'regenerate'; targetMessageId: number };

type AgentV2ActiveRunAdmission = {
  admission: AgentV2RunAdmission;
  isApplied: boolean;
};

type AgentV2ThreadClearOperation = {
  operationId: number;
  threadId: string;
  threadRevision: number;
};

export interface AgentV2RunControllerDependencies {
  buildConnectionError: () => string;
  clearThread: (
    threadId: string,
    expectedRevision: number,
  ) => Promise<AgentV2MutationResult<AgentThreadClearResponseV2> | undefined>;
  dispatch: (action: AgentV2MessagesStateAction) => void;
  getErrorText: (code: AgentErrorCodeV2) => string;
  getState: () => AgentV2MessagesState;
  hydrate: (shouldPreserveLiveContent?: boolean, isFailureSilent?: boolean) => Promise<void>;
  now: () => number;
  retryRun: (clientRunId: string) => Promise<AgentV2RunResult | undefined>;
  resetHistory: NoneToVoidFunction;
  startRun: (command: AgentV2RunCommand) => Promise<AgentV2RunResult | undefined>;
  stream: AgentV2StreamController;
}

export interface AgentV2RunController {
  clearChat: NoneToVoidFunction;
  dispose: NoneToVoidFunction;
  handleUpdate: (update: AgentV2ClientUpdate) => void;
  isInputBlocked: () => boolean;
  releaseStaleThreadClearOperation: (
    thread: AgentThreadSummaryV2,
    shouldMatchRevision: boolean,
  ) => void;
  retryAdmission: NoneToVoidFunction;
  retryMessage: (messageId: number) => void;
  sendFollowup: (messageId: number, followup: AgentPublicFollowUpV2) => void;
  sendHint: (hint: AgentHint) => void;
  sendMessage: (
    text: string,
    editMessageId?: number,
    inputContinuation?: {
      messageId: number;
      continuation: AgentPublicInputContinuationV1;
    },
  ) => void;
  sendWalletControl: (messageId: number, control: AgentV2WalletConversationControl) => void;
}

export function createAgentV2RunController(
  dependencies: AgentV2RunControllerDependencies,
): AgentV2RunController {
  let nextRunOperationId = 0;
  let nextThreadMutationOperationId = 0;
  let activeRunOperationId: number | undefined;
  let isActiveRunTerminal = false;
  let activeThreadClearOperation: AgentV2ThreadClearOperation | undefined;
  let isDisposed = false;
  const admissionsByOperation = new Map<number, AgentV2ActiveRunAdmission>();
  const retainedAdmissions = new Map<string, AgentV2RunAdmission>();

  return {
    clearChat,
    dispose,
    handleUpdate,
    isInputBlocked,
    releaseStaleThreadClearOperation,
    retryAdmission,
    retryMessage,
    sendFollowup,
    sendHint,
    sendMessage,
    sendWalletControl,
  };

  function dispose() {
    isDisposed = true;
    activeRunOperationId = undefined;
    activeThreadClearOperation = undefined;
    admissionsByOperation.clear();
    retainedAdmissions.clear();
  }

  function sendMessage(
    text: string,
    editMessageId?: number,
    inputContinuation?: {
      messageId: number;
      continuation: AgentPublicInputContinuationV1;
    },
  ) {
    const trimmed = text.trim();
    const thread = dependencies.getState().thread;
    if (!trimmed || !thread || isInputBlocked()) return;

    const targetMessageId = editMessageId ? dependencies.stream.getSourceId(editMessageId) : undefined;
    if (editMessageId && !targetMessageId) return;
    if (targetMessageId && inputContinuation) return;
    const continuationMessageId = inputContinuation
      ? dependencies.stream.getSourceId(inputContinuation.messageId)
      : undefined;
    if (inputContinuation && !continuationMessageId) return;

    if (targetMessageId) {
      void run(
        { input: { kind: 'edit', targetUserMessageId: targetMessageId, text: trimmed } },
        { kind: 'edit', targetMessageId: editMessageId!, text: trimmed },
      );
      return;
    }

    const outgoingMessageId = addOptimisticMessage(trimmed);
    void run({
      input: { kind: 'append', text: trimmed },
      ...(continuationMessageId && inputContinuation
        ? {
          continuationOf: {
            messageId: continuationMessageId,
            continuationId: inputContinuation.continuation.id,
          },
        }
        : { entryPoint: { kind: 'agentTab' } }),
    }, { kind: 'append', messageId: outgoingMessageId });
  }

  function sendHint(hint: AgentHint) {
    const current = dependencies.getState();
    const sourceHint = current.hintsResponse?.items.find(({ id }) => id === hint.id);
    if (!current.thread || !current.hintsResponse || !sourceHint || isInputBlocked()) return;
    const outgoingMessageId = addOptimisticMessage(hint.prompt);
    void run({
      input: { kind: 'append', text: hint.prompt },
      entryPoint: {
        kind: 'emptyState',
        surface: 'agentTab',
        hintId: sourceHint.id,
        catalogVersion: current.hintsResponse.catalogVersion,
      },
    }, { kind: 'append', messageId: outgoingMessageId });
  }

  function sendFollowup(messageId: number, followup: AgentPublicFollowUpV2) {
    const thread = dependencies.getState().thread;
    const sourceMessageId = dependencies.stream.getSourceId(messageId);
    if (!thread || !sourceMessageId || isInputBlocked()) return;
    const { text } = followup;
    const outgoingMessageId = addOptimisticMessage(text);
    void run({
      input: { kind: 'append', text },
      followupOf: { messageId: sourceMessageId, followupId: followup.id },
    }, { kind: 'append', messageId: outgoingMessageId });
  }

  function sendWalletControl(messageId: number, control: AgentV2WalletConversationControl) {
    const thread = dependencies.getState().thread;
    const sourceMessageId = dependencies.stream.getSourceId(messageId);
    if (!thread || !sourceMessageId || isInputBlocked()) return;
    const outgoingMessageId = addOptimisticMessage(control.label);
    void run({
      input: { kind: 'append', text: control.label },
      walletScopeSelectionOf: {
        sourceAssistantMessageId: sourceMessageId,
        choiceId: control.choiceId,
      },
    }, { kind: 'append', messageId: outgoingMessageId });
  }

  function retryMessage(messageId: number) {
    const thread = dependencies.getState().thread;
    const sourceMessageId = dependencies.stream.getSourceId(messageId);
    if (!thread || !sourceMessageId || isInputBlocked()) return;
    void run(
      { input: { kind: 'regenerate', targetAssistantMessageId: sourceMessageId } },
      { kind: 'regenerate', targetMessageId: messageId },
    );
  }

  function retryAdmission() {
    const current = dependencies.getState();
    const clientRunId = current.admissionFailure?.clientRunId
      ?? current.quotaRetry?.clientRunId
      ?? current.userRateLimit?.clientRunId;
    if (!clientRunId || isInputBlocked()) return;
    const operationId = requestRun('admissionRetry', retainedAdmissions.get(clientRunId));
    void retryAdmissionRun(clientRunId, operationId);
  }

  function clearChat() {
    const current = dependencies.getState();
    const thread = current.thread;
    if (
      isDisposed
      || !thread
      || current.isLoading
      || selectIsAgentV2RunActive(current)
      || activeThreadClearOperation !== undefined
    ) return;

    const operation = {
      operationId: ++nextThreadMutationOperationId,
      threadId: thread.id,
      threadRevision: thread.revision,
    };
    activeThreadClearOperation = operation;
    dependencies.dispatch({ kind: 'threadClearStarted', ...operation });
    void clearThread(thread, operation);
  }

  function addOptimisticMessage(text: string) {
    const timestamp = dependencies.now();
    const messageId = dependencies.stream.getMessageId(`local-${timestamp}`);
    dependencies.dispatch({
      kind: 'optimisticMessageAdded',
      message: {
        id: messageId,
        text,
        isOutgoing: true,
        timestamp,
      },
    });
    return messageId;
  }

  async function run(command: AgentV2RunCommandInput, admission: AgentV2RunAdmission) {
    const thread = dependencies.getState().thread;
    if (!thread || isDisposed) return;
    const operationId = requestRun('command', admission);
    try {
      const result = await dependencies.startRun({
        ...command,
        threadId: thread.id,
        expectedThreadRevision: thread.revision,
      });
      await settleRunResult(result, operationId, false);
    } catch {
      setRunConnectionError(operationId);
    } finally {
      finishRunOperation(operationId);
    }
  }

  async function retryAdmissionRun(clientRunId: string, operationId: number) {
    try {
      const result = await dependencies.retryRun(clientRunId);
      await settleRunResult(result, operationId, true);
    } catch {
      setRunConnectionError(operationId);
    } finally {
      finishRunOperation(operationId);
    }
  }

  async function settleRunResult(
    result: AgentV2RunResult | undefined,
    operationId: number,
    shouldConsumeAdmissionRetry: boolean,
  ) {
    if (isDisposed) return;
    if (!result) {
      if (activeRunOperationId === operationId) setRunConnectionError(operationId);
      return;
    }
    if (activeRunOperationId === operationId && result.runId) {
      applyRunAdmission(result.inputMessageId, operationId);
    } else {
      bindRunInputMessage(result.inputMessageId, operationId);
    }
    if (result.state === 'failed') retainRunAdmission(result.clientRunId, operationId);
    if (activeRunOperationId !== operationId) return;
    switch (result.state) {
      case 'completed':
        retainedAdmissions.delete(result.clientRunId);
        if (shouldConsumeAdmissionRetry) {
          dependencies.dispatch({ kind: 'admissionRetryConsumed', operationId });
        }
        break;
      case 'cancelled':
        retainedAdmissions.delete(result.clientRunId);
        dependencies.stream.flushDeltas();
        dependencies.stream.terminalizeTextRevealPresentations();
        dependencies.dispatch({ kind: 'runCancelled', clientRunId: result.clientRunId });
        if (shouldConsumeAdmissionRetry) {
          dependencies.dispatch({ kind: 'admissionRetryConsumed', operationId });
        }
        break;
      case 'failed':
        break;
      case 'interrupted':
        retainedAdmissions.delete(result.clientRunId);
        setRunConnectionError(operationId);
        await dependencies.hydrate(true, true);
        break;
      default:
        assertUnreachable(result.state);
    }
  }

  function requestRun(
    operationKind: 'command' | 'admissionRetry',
    admission?: AgentV2RunAdmission,
  ) {
    const operationId = ++nextRunOperationId;
    activeRunOperationId = operationId;
    isActiveRunTerminal = false;
    if (admission) admissionsByOperation.set(operationId, { admission, isApplied: false });
    dependencies.dispatch({ kind: 'runRequested', operationId, operationKind });
    return operationId;
  }

  function finishRunOperation(operationId: number) {
    if (activeRunOperationId === operationId) {
      activeRunOperationId = undefined;
      isActiveRunTerminal = false;
    }
    admissionsByOperation.delete(operationId);
    if (!isDisposed) dependencies.dispatch({ kind: 'runSettled', operationId });
  }

  function bindRunInputMessage(inputMessageId: string | undefined, operationId: number) {
    if (!inputMessageId) return;
    const activeAdmission = admissionsByOperation.get(operationId);
    if (!activeAdmission || activeAdmission.admission.kind === 'regenerate') return;
    const messageId = activeAdmission.admission.kind === 'append'
      ? activeAdmission.admission.messageId
      : activeAdmission.admission.targetMessageId;
    dependencies.stream.bindMessageSource(messageId, inputMessageId);
  }

  function applyRunAdmission(inputMessageId: string | undefined, operationId: number) {
    const activeAdmission = admissionsByOperation.get(operationId);
    if (!activeAdmission || activeAdmission.isApplied) return;
    const { admission } = activeAdmission;
    if (admission.kind !== 'regenerate' && !inputMessageId) return;
    activeAdmission.isApplied = true;

    switch (admission.kind) {
      case 'append':
        dependencies.stream.bindMessageSource(admission.messageId, inputMessageId!);
        break;
      case 'edit':
        pruneAdmittedMessages(admission.targetMessageId, true);
        dependencies.dispatch({
          kind: 'editRunAdmitted',
          targetMessageId: admission.targetMessageId,
          text: admission.text,
        });
        dependencies.stream.bindMessageSource(admission.targetMessageId, inputMessageId!);
        break;
      case 'regenerate':
        pruneAdmittedMessages(admission.targetMessageId, false);
        dependencies.dispatch({ kind: 'regenerateRunAdmitted', targetMessageId: admission.targetMessageId });
        break;
      default:
        assertUnreachable(admission);
    }
  }

  function pruneAdmittedMessages(targetMessageId: number, shouldRetainTarget: boolean) {
    const messages = dependencies.getState().messages;
    const targetIndex = messages.findIndex(({ id }) => id === targetMessageId);
    if (targetIndex < 0) return;
    const endIndex = shouldRetainTarget ? targetIndex + 1 : targetIndex;
    dependencies.stream.pruneMessageArtifacts(new Set(
      messages.slice(0, endIndex).map(({ id }) => id),
    ));
  }

  function retainRunAdmission(clientRunId: string, operationId: number) {
    const activeAdmission = admissionsByOperation.get(operationId);
    if (!activeAdmission || activeAdmission.isApplied) return;
    retainedAdmissions.set(clientRunId, activeAdmission.admission);
  }

  function handleUpdate(update: AgentV2ClientUpdate) {
    if (isDisposed) return;
    switch (update.kind) {
      case 'runStarted':
        if (activeRunOperationId !== undefined) {
          applyRunAdmission(update.inputMessageId, activeRunOperationId);
        }
        dependencies.dispatch({
          kind: 'runStarted',
          clientRunId: update.clientRunId,
          threadId: update.threadId,
          threadRevision: update.threadRevision,
        });
        break;
      case 'toolActivityChanged':
        dependencies.dispatch({
          kind: 'toolActivityChanged',
          clientRunId: update.clientRunId,
          activity: update.status === 'queued' || update.status === 'running'
            ? {
              kind: 'tool',
              toolName: update.toolName,
              ...(update.operation ? { operation: update.operation } : {}),
            }
            : { kind: 'preparingResponse' },
        });
        break;
      case 'runActivityChanged':
        dependencies.dispatch({
          kind: 'runActivityChanged',
          clientRunId: update.clientRunId,
          event: update.event,
        });
        break;
      case 'threadChanged':
        if (dependencies.getState().thread?.id !== update.thread.id) retainedAdmissions.clear();
        releaseStaleThreadClearOperation(update.thread, false);
        dependencies.dispatch({ kind: 'threadChanged', thread: update.thread });
        break;
      case 'runFailed':
        handleRunFailed(update);
        break;
      case 'runCancelled':
        dependencies.dispatch({ kind: 'runCancelled', clientRunId: update.clientRunId });
        break;
      case 'availabilityChanged':
        dependencies.dispatch({ kind: 'availabilityChanged', availability: update.availability });
        break;
      case 'userQuotaChanged':
        dependencies.dispatch({ kind: 'userQuotaChanged', quota: update.quota });
        break;
      case 'runtimeReady':
      case 'messageStarted':
      case 'textDelta':
      case 'messageContentEnded':
      case 'followupsAvailable':
      case 'inputContinuationsAvailable':
      case 'actionAvailable':
      case 'semanticContentAvailable':
      case 'messageCompleted':
      case 'walletAuthorityChanged':
      case 'walletContextChanged':
        break;
      default:
        assertUnreachable(update);
    }
  }

  function handleRunFailed(update: Extract<AgentV2ClientUpdate, { kind: 'runFailed' }>) {
    isActiveRunTerminal = true;
    const errorText = dependencies.getErrorText(update.code);
    const messageId = update.messageId ? dependencies.stream.findMessageId(update.messageId) : undefined;
    const activeAdmission = activeRunOperationId !== undefined
      ? admissionsByOperation.get(activeRunOperationId)
      : undefined;
    const isPreAdmissionFailure = !update.runId && messageId === undefined;
    if (activeRunOperationId !== undefined && isPreAdmissionFailure && update.retryable) {
      retainRunAdmission(update.clientRunId, activeRunOperationId);
    }
    dependencies.dispatch({
      kind: 'runFailed',
      clientRunId: update.clientRunId,
      code: update.code,
      retryable: update.retryable,
      ...(messageId !== undefined ? { messageId } : {}),
      ...(update.resetAt ? {
        resetAt: update.resetAt,
        resetAtIso: new Date(update.resetAt).toISOString(),
      } : {}),
      hasRunId: Boolean(update.runId),
      ...(isPreAdmissionFailure
        && !activeAdmission?.isApplied
        && activeAdmission?.admission.kind === 'append'
        ? { optimisticMessageId: activeAdmission.admission.messageId }
        : {}),
      ...(isPreAdmissionFailure
        && !activeAdmission?.isApplied
        && activeAdmission?.admission.kind === 'regenerate'
        ? { retryMessageId: activeAdmission.admission.targetMessageId }
        : {}),
      errorText,
      timestamp: dependencies.now(),
    });
    if (update.code === 'thread_revision_conflict') {
      void dependencies.hydrate(false, true).then(() => setError(errorText));
    }
  }

  async function clearThread(thread: AgentThreadSummaryV2, operation: AgentV2ThreadClearOperation) {
    try {
      const result = await dependencies.clearThread(thread.id, thread.revision);
      if (!isThreadClearOperationActive(operation)) return;
      if (!result?.ok) {
        dependencies.dispatch({
          kind: 'threadClearFailed',
          operationId: operation.operationId,
          error: buildConnectionError(),
        });
        return;
      }
      if (doesThreadClearOperationMatch(operation, result.value.thread)) {
        dependencies.resetHistory();
        dependencies.stream.resetMessageArtifacts();
        retainedAdmissions.clear();
      }
      dependencies.dispatch({
        kind: 'threadClearSucceeded',
        operationId: operation.operationId,
        thread: result.value.thread,
      });
    } catch {
      if (!isThreadClearOperationActive(operation)) return;
      dependencies.dispatch({
        kind: 'threadClearFailed',
        operationId: operation.operationId,
        error: buildConnectionError(),
      });
    } finally {
      if (isThreadClearOperationActive(operation)) activeThreadClearOperation = undefined;
    }
  }

  function isThreadClearOperationActive(operation: AgentV2ThreadClearOperation) {
    return !isDisposed
      && activeThreadClearOperation?.operationId === operation.operationId
      && activeThreadClearOperation.threadId === operation.threadId
      && activeThreadClearOperation.threadRevision === operation.threadRevision;
  }

  function releaseStaleThreadClearOperation(
    thread: AgentThreadSummaryV2,
    shouldMatchRevision: boolean,
  ) {
    if (!activeThreadClearOperation) return;
    const isMatching = activeThreadClearOperation.threadId === thread.id
      && (!shouldMatchRevision || activeThreadClearOperation.threadRevision === thread.revision);
    if (!isMatching) activeThreadClearOperation = undefined;
  }

  function doesThreadClearOperationMatch(
    operation: AgentV2ThreadClearOperation,
    succeededThread: AgentThreadSummaryV2,
  ) {
    const currentThread = dependencies.getState().thread;
    return currentThread?.id === operation.threadId
      && (
        currentThread.revision === operation.threadRevision
        || (
          currentThread.id === succeededThread.id
          && currentThread.revision === succeededThread.revision
        )
      );
  }

  function setRunConnectionError(operationId: number) {
    if (isDisposed) return;
    dependencies.dispatch({
      kind: 'runConnectionFailed',
      operationId,
      error: {
        ...buildConnectionError(),
        cause: { code: 'network_error', retryable: true },
      },
    });
  }

  function setError(text: string) {
    if (isDisposed) return;
    dependencies.dispatch({ kind: 'errorSet', error: { text, timestamp: dependencies.now() } });
  }

  function buildConnectionError() {
    return { text: dependencies.buildConnectionError(), timestamp: dependencies.now() };
  }

  function isInputBlocked() {
    if (isDisposed) return true;
    if (
      (activeRunOperationId !== undefined && !isActiveRunTerminal)
      || activeThreadClearOperation !== undefined
    ) return true;
    const current = dependencies.getState();
    const composerStatus = selectAgentV2ComposerStatus(
      current.availability,
      current.userQuota,
      current.quotaRetry,
      current.userRateLimit,
      dependencies.now(),
    );
    return selectIsAgentV2InputDisabled(current, isAgentV2ComposerBlocked(composerStatus));
  }
}

function assertUnreachable(value: never): never {
  throw new Error(`Unsupported Agent V2 value: ${String(value)}`);
}
