import '../../global/actions/apiUpdates/agentV2';

import { memo, useEffect, useRef } from '../../lib/teact/teact';
import { withGlobal } from '../../global';

import type {
  AgentV2HostContextSnapshot,
  AgentV2HostContextUpdate,
  AgentV2OperationResult,
} from '../../api/agentV2/types';
import type { GlobalState } from '../../global/types';

import {
  cancelAgentV2ActiveRunReplays,
  getLatestAgentV2RuntimeGeneration,
  subscribeToAgentV2RuntimeReady,
} from '../../util/agentV2Updates';
import { areDeepEqual } from '../../util/areDeepEqual';
import { callApi } from '../../api';
import { selectAgentV2HostContext } from './buildHostContext';

const HOST_CONTEXT_RETRY_INITIAL_DELAY_MS = 250;
const HOST_CONTEXT_RETRY_MAX_DELAY_MS = 4_000;
const HOST_CONTEXT_RETRY_MAX_EXPONENT = Math.log2(
  HOST_CONTEXT_RETRY_MAX_DELAY_MS / HOST_CONTEXT_RETRY_INITIAL_DELAY_MS,
);

export interface AgentV2HostContextDeliveryState {
  generation: number;
  isReady: boolean;
}

export interface AgentV2HostContextDeliveryNotifier {
  getCurrent(): AgentV2HostContextDeliveryState;
  subscribe(listener: (state: AgentV2HostContextDeliveryState) => void): () => void;
}

interface AgentV2HostContextDeliveryController {
  destroy(): void;
  updateSnapshot(snapshot: AgentV2HostContextSnapshot): void;
}

interface AgentV2HostContextDeliveryControllerOptions {
  deliver(snapshot: AgentV2HostContextSnapshot): Promise<AgentV2HostContextDeliveryResult | undefined>;
  notifier: AgentV2HostContextDeliveryNotifier;
}

type AgentV2HostContextDeliveryResult = AgentV2OperationResult<AgentV2HostContextUpdate>;

const DEFAULT_DELIVERY_NOTIFIER: AgentV2HostContextDeliveryNotifier = {
  getCurrent: () => {
    const generation = getLatestAgentV2RuntimeGeneration();
    return {
      generation: generation ?? 0,
      isReady: generation !== undefined,
    };
  },
  subscribe: (listener) => subscribeToAgentV2RuntimeReady((generation) => {
    listener({ generation, isReady: true });
  }),
};

interface StateProps {
  hostContext: AgentV2HostContextSnapshot;
}

interface OwnProps {
  deliveryNotifier?: AgentV2HostContextDeliveryNotifier;
}

export function AgentV2HostContextBridge({
  deliveryNotifier = DEFAULT_DELIVERY_NOTIFIER,
  hostContext,
}: StateProps & OwnProps) {
  const deliveryController = useRef<AgentV2HostContextDeliveryController>();
  const latestHostContext = useRef(hostContext);
  latestHostContext.current = hostContext;

  useEffect(() => {
    const controller = createAgentV2HostContextDeliveryController({
      deliver: updateHostContext,
      notifier: deliveryNotifier,
    });
    deliveryController.current = controller;
    controller.updateSnapshot(latestHostContext.current);

    return () => {
      controller.destroy();
      if (deliveryController.current === controller) deliveryController.current = undefined;
    };
  }, [deliveryNotifier]);

  useEffect(() => {
    deliveryController.current?.updateSnapshot(hostContext);
  }, [hostContext]);

  return undefined;
}

export function createAgentV2HostContextDeliveryController({
  deliver,
  notifier,
}: AgentV2HostContextDeliveryControllerOptions): AgentV2HostContextDeliveryController {
  let deliveryState = notifier.getCurrent();
  let latestSnapshot: AgentV2HostContextSnapshot | undefined;
  let pendingSnapshot: AgentV2HostContextSnapshot | undefined;
  let acknowledgedSnapshot: AgentV2HostContextSnapshot | undefined;
  let acknowledgedGeneration: number | undefined;
  let inFlightSnapshot: AgentV2HostContextSnapshot | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryExponent = 0;
  let deliveryEpoch = 0;
  let isDestroyed = false;

  const unsubscribe = notifier.subscribe(updateDeliveryState);

  return {
    destroy,
    updateSnapshot,
  };

  function updateSnapshot(snapshot: AgentV2HostContextSnapshot) {
    if (latestSnapshot && areDeepEqual(latestSnapshot, snapshot)) return;

    latestSnapshot = snapshot;
    retryExponent = 0;
    clearRetryTimer();
    if (
      !inFlightSnapshot
      && acknowledgedGeneration === deliveryState.generation
      && acknowledgedSnapshot
      && areDeepEqual(acknowledgedSnapshot, snapshot)
    ) {
      pendingSnapshot = undefined;
      return;
    }

    pendingSnapshot = snapshot;
    deliverPendingSnapshot();
  }

  function updateDeliveryState(nextState: AgentV2HostContextDeliveryState) {
    deliveryState = nextState;
    deliveryEpoch += 1;
    acknowledgedSnapshot = undefined;
    acknowledgedGeneration = undefined;
    pendingSnapshot = latestSnapshot;
    retryExponent = 0;
    clearRetryTimer();
    deliverPendingSnapshot();
  }

  function deliverPendingSnapshot() {
    if (
      isDestroyed
      || !deliveryState.isReady
      || inFlightSnapshot
      || retryTimer !== undefined
      || !pendingSnapshot
    ) return;

    const snapshot = pendingSnapshot;
    const generation = deliveryState.generation;
    const epoch = deliveryEpoch;
    pendingSnapshot = undefined;
    inFlightSnapshot = snapshot;
    void deliver(snapshot).then(
      (result) => settleDelivery(snapshot, generation, epoch, result),
      () => settleDelivery(snapshot, generation, epoch, undefined),
    );
  }

  function settleDelivery(
    snapshot: AgentV2HostContextSnapshot,
    generation: number,
    epoch: number,
    result: AgentV2HostContextDeliveryResult | undefined,
  ) {
    if (inFlightSnapshot !== snapshot) return;

    inFlightSnapshot = undefined;
    if (isDestroyed) return;

    const isCurrentGeneration = generation === deliveryState.generation
      && epoch === deliveryEpoch
      && deliveryState.isReady;
    if (result?.ok && result.value.generation === generation && isCurrentGeneration) {
      acknowledgedSnapshot = snapshot;
      acknowledgedGeneration = generation;
      retryExponent = 0;
      if (pendingSnapshot && areDeepEqual(pendingSnapshot, snapshot)) pendingSnapshot = undefined;
      if (!pendingSnapshot && latestSnapshot && !areDeepEqual(latestSnapshot, snapshot)) {
        pendingSnapshot = latestSnapshot;
      }
      deliverPendingSnapshot();
      return;
    }

    acknowledgedSnapshot = undefined;
    acknowledgedGeneration = undefined;
    pendingSnapshot = latestSnapshot;
    if (generation !== deliveryState.generation || epoch !== deliveryEpoch) {
      retryExponent = 0;
      deliverPendingSnapshot();
      return;
    }
    scheduleRetry();
  }

  function scheduleRetry() {
    if (isDestroyed || !deliveryState.isReady || retryTimer !== undefined || !pendingSnapshot) return;

    const delay = HOST_CONTEXT_RETRY_INITIAL_DELAY_MS * (2 ** retryExponent);
    retryExponent = Math.min(retryExponent + 1, HOST_CONTEXT_RETRY_MAX_EXPONENT);
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      deliverPendingSnapshot();
    }, delay);
  }

  function clearRetryTimer() {
    if (retryTimer === undefined) return;
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  function destroy() {
    if (isDestroyed) return;
    isDestroyed = true;
    clearRetryTimer();
    unsubscribe();
  }
}

async function updateHostContext(hostContext: AgentV2HostContextSnapshot) {
  const result = await callApi('updateAgentV2HostContext', hostContext);
  if (result?.ok && result.value.authorityChanged) cancelAgentV2ActiveRunReplays();
  return result;
}

export default memo(withGlobal<OwnProps>((global: GlobalState): StateProps => ({
  hostContext: selectAgentV2HostContext(global),
}))(AgentV2HostContextBridge));
