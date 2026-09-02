import type {
  AgentEntryPoint,
} from './coreRun';
import type {
  AgentAddressRef,
  AgentApiChain,
  AgentAssetRefV2,
  AgentMoneyAmount,
  AgentToolSuccessEnvelopeBaseV1,
  AgentToolWarning,
  UtcTimestampMs,
  Uuid,
} from './shared';
import type { AgentAssetIdentityV2, AgentSwapAmountV1 } from './wallet';

export type ActionSendPrepareResult = AgentPreparedActionResult & {
  action?: AgentWalletAction & {
    kind?: 'send';
  };
  summary?: AgentPreparedSendSummaryV1;
};

export type AgentPreparedSendSummaryV1 = AgentPreparedActionSummary & Record<string, unknown>;

export type ActionSendPrepareSuccessV1 = AgentToolSuccessEnvelopeBaseV1 & {
  result: ActionSendPrepareResult;
};

export type AgentActionProposal =
  | AgentWalletAction
  | AgentSendFormActionV1
  | AgentReceiveActionV2
  | AgentReceiveActionV3
  | AgentStakeActionV2
  | AgentSwapActionV1
  | AgentHideSpamAssetsActionV1
  | AgentOpenUrlAction
  | AgentOpenTokenAction
  | AgentOpenTransactionAction
  | AgentOpenAgentAction;

export type AgentActionLabelCodeV1 =
  | 'hide_spam_assets'
  | 'open_agent'
  | 'open_external_link'
  | 'open_receive'
  | 'open_send'
  | 'open_staking'
  | 'open_swap'
  | 'open_token'
  | 'open_transaction'
  | 'review_transfer';

export type AgentPersistedActionV2 =
  | AgentPersistedWalletActionV2
  | AgentPersistedSendFormActionV1
  | AgentPersistedLegacyOpenSendActionV1
  | AgentPersistedHideSpamAssetsActionV1
  | AgentPersistedNavigationActionV2
  | AgentPersistedNavigationActionV3;

export type AgentPersistedWalletActionV2 =
  | {
    id: Uuid;
    kind: 'send';
    labelCode: 'review_transfer';
    draftId: Uuid;
    draftExpiresAt: UtcTimestampMs;
    sourceToolCallId: Uuid;
    effect: 'open_wallet_review';
    localDraftRequired: true;
    requiresConfirmation: true;
  }
  | {
    id: Uuid;
    kind: 'receive';
    labelCode: 'open_receive';
    effect: 'open_receive';
    localDraftRequired: false;
    requiresConfirmation: false;
  }
  | {
    id: Uuid;
    schemaVersion: 3;
    kind: 'receive';
    labelCode: 'open_receive';
    effect: 'open_receive';
    targetNetwork: AgentApiChain;
    localDraftRequired: false;
    requiresConfirmation: false;
  }
  | AgentPersistedStakeActionV2
  | AgentPersistedSwapActionV1;

export interface AgentPersistedStakeActionV2 {
  id: Uuid;
  schemaVersion: 2;
  kind: 'stake';
  labelCode: 'open_staking';
  effect: 'open_staking';
  productId: string;
  asset: AgentAssetIdentityV2;
  amount?: AgentStakeAmountV2;
  localDraftRequired: false;
  requiresConfirmation: false;
}

export interface AgentPersistedSwapActionV1 {
  id: Uuid;
  schemaVersion: 1;
  kind: 'swap';
  labelCode: 'open_swap';
  effect: 'open_swap';
  sourceAsset: AgentAssetIdentityV2;
  destinationAsset: AgentAssetIdentityV2;
  amount: AgentSwapAmountV1;
  localDraftRequired: false;
  requiresConfirmation: false;
}

export interface AgentPersistedSendFormActionV1 {
  id: Uuid;
  kind: 'send';
  labelCode: 'open_send';
  effect: 'live_only';
  localDraftRequired: false;
  requiresConfirmation: false;
}

export interface AgentPersistedLegacyOpenSendActionV1 {
  id: Uuid;
  kind: 'openSend';
  labelCode: 'open_send';
  effect: 'live_only';
  requiresConfirmation: false;
}

export type AgentPersistedNavigationActionV2 =
  | {
    id: Uuid;
    kind: 'openUrl';
    labelCode: 'open_external_link';
    requiresConfirmation: true;
  }
  | {
    id: Uuid;
    kind: 'openAgent';
    labelCode: 'open_agent';
    requiresConfirmation: true;
  }
  | {
    id: Uuid;
    kind: 'openToken';
    labelCode: 'open_token';
    requiresConfirmation: true;
  }
  | {
    id: Uuid;
    kind: 'openTransaction';
    labelCode: 'open_transaction';
    requiresConfirmation: true;
  };

export type AgentPersistedNavigationActionV3 =
  | {
    id: Uuid;
    schemaVersion: 3;
    kind: 'openUrl';
    labelCode: 'open_external_link';
    url: string;
    requiresConfirmation: true;
  }
  | {
    id: Uuid;
    schemaVersion: 3;
    kind: 'openToken';
    labelCode: 'open_token';
    slug: string;
    chain: string;
    tokenAddress?: string;
    requiresConfirmation: true;
  }
  | {
    id: Uuid;
    schemaVersion: 3;
    kind: 'openTransaction';
    labelCode: 'open_transaction';
    chain: string;
    transactionRef: string;
    requiresConfirmation: true;
  }
  | {
    id: Uuid;
    schemaVersion: 3;
    kind: 'openAgent';
    labelCode: 'open_agent';
    entryPoint: AgentEntryPoint;
    requiresConfirmation: true;
  };

export interface ActionSendPrepareArgs {
  asset: AgentAssetRefV2;
  amount: {
    value: string;
    valueType: 'decimal';
  };
  recipient:
    | {
      kind: 'address';
      chain: AgentApiChain;
      address: string;
    }
    | {
      kind: 'domain';
      chain: AgentApiChain;
      domain: string;
    }
    | {
      kind: 'savedAddress';
      addressRef: string;
    };
  comment?: string;
}

export interface AgentPreparedActionResult {
  draftId: Uuid;
  draftExpiresAt: UtcTimestampMs;
  action: AgentWalletAction & {
    kind?: 'send' | 'swap' | 'stake';
  };
  summary: AgentPreparedActionSummary;
  /**
   * @maxItems 8
   */
  warnings?: AgentToolWarning[];
}

export interface AgentWalletAction {
  id: Uuid;
  kind: 'send';
  labelCode: 'review_transfer';
  draftId: Uuid;
  draftExpiresAt: UtcTimestampMs;
  sourceToolCallId: Uuid;
  effect: 'open_wallet_review';
  localDraftRequired: true;
  requiresConfirmation: true;
}

export interface AgentPreparedActionSummary {
  account: AgentPreparedAccountRef;
  primaryAmount?: AgentMoneyAmount;
  fee?: AgentMoneyAmount;
  feeStatus?: 'estimated' | 'calculated_in_wallet';
  destination?: AgentAddressRef;
  /**
   * @maxItems 4
   */
  sendWarnings?: {
    code: 'scam_suspected' | 'memo_required' | 'new_address';
    disposition: 'review' | 'input_required';
  }[];
  quote?: {
    from: AgentMoneyAmount;
    to: AgentMoneyAmount;
    minTo?: AgentMoneyAmount;
    routeLabel?: string;
    quoteExpiresAt?: UtcTimestampMs;
  };
}

export interface AgentPreparedAccountRef {
  accountRef: string;
  label: string;
  accountType: 'regular' | 'ledger' | 'viewOnly' | 'multisig' | 'unknown';
  isViewOnly: boolean;
  /**
   * @minItems 1
   * @maxItems 16
   */
  chains: AgentApiChain[];
}

export interface AgentActionEvent {
  type: 'action';
  protocolVersion: 2;
  runId: Uuid;
  sequence: number;
  messageId: Uuid;
  action: AgentActionProposal;
  createdAt?: UtcTimestampMs;
}

export interface AgentReceiveActionV2 {
  id: Uuid;
  kind: 'receive';
  labelCode: 'open_receive';
  effect: 'open_receive';
  contextBinding: AgentReceiveContextBindingV2;
  localDraftRequired: false;
  requiresConfirmation: false;
}

export interface AgentReceiveActionV3 {
  id: Uuid;
  schemaVersion: 3;
  kind: 'receive';
  labelCode: 'open_receive';
  effect: 'open_receive';
  contextBinding: AgentReceiveContextBindingV2;
  targetNetwork: AgentApiChain;
  localDraftRequired: false;
  requiresConfirmation: false;
}

export interface AgentStakeActionV2 {
  id: Uuid;
  schemaVersion: 2;
  kind: 'stake';
  labelCode: 'open_staking';
  effect: 'open_staking';
  contextBinding: AgentStakeContextBindingV1;
  productId: string;
  asset: AgentAssetIdentityV2;
  amount?: AgentStakeAmountV2;
  localDraftRequired: false;
  requiresConfirmation: false;
}

export type AgentStakeAmountV2 =
  | { kind: 'exact'; value: string }
  | { kind: 'all' };

export interface AgentStakeContextBindingV1 {
  sessionId: Uuid;
  revision: number;
  activeAccountRef: string;
}

export interface AgentSwapActionV1 {
  id: Uuid;
  schemaVersion: 1;
  kind: 'swap';
  labelCode: 'open_swap';
  effect: 'open_swap';
  sourceToolCallId: Uuid;
  contextBinding: AgentSwapContextBindingV1;
  sourceAsset: AgentAssetIdentityV2;
  destinationAsset: AgentAssetIdentityV2;
  amount: AgentSwapAmountV1;
  localDraftRequired: false;
  requiresConfirmation: false;
}

export interface AgentSwapContextBindingV1 {
  sessionId: Uuid;
  revision: number;
  activeAccountRef: string;
}

export interface AgentSendFormActionV1 {
  id: Uuid;
  kind: 'send';
  labelCode: 'open_send';
  effect: 'open_send';
  contextBinding: AgentReceiveContextBindingV2;
  asset: AgentAssetRefV2;
  recipient: ActionSendPrepareArgs['recipient'];
  localDraftRequired: false;
  requiresConfirmation: false;
}

export interface AgentReceiveContextBindingV2 {
  sessionId: Uuid;
  revision: number;
  activeAccountRef: string;
  activeNetwork: string;
}

export interface AgentHideSpamAssetsActionV1 {
  id: Uuid;
  kind: 'hideSpamAssets';
  labelCode: 'hide_spam_assets';
  sourceToolCallId: Uuid;
  /**
   * @minItems 1
   * @maxItems 20
   */
  assetRefs: string[];
  contextBinding: AgentHideSpamAssetsContextBindingV1;
  effect: 'hide_spam_assets';
  localMutationRequired: true;
  requiresConfirmation: false;
}

export interface AgentHideSpamAssetsContextBindingV1 {
  sessionId: Uuid;
  revision: number;
  activeAccountRef: string;
}

export interface AgentOpenUrlAction {
  id: Uuid;
  kind: 'openUrl';
  labelCode: 'open_external_link';
  url: string;
  requiresConfirmation: true;
}

export interface AgentOpenTokenAction {
  id: Uuid;
  kind: 'openToken';
  labelCode: 'open_token';
  slug: string;
  chain: string;
  tokenAddress?: string;
  requiresConfirmation: true;
}

export interface AgentOpenTransactionAction {
  id: Uuid;
  kind: 'openTransaction';
  labelCode: 'open_transaction';
  chain: string;
  transactionRef: string;
  requiresConfirmation: true;
}

export interface AgentOpenAgentAction {
  id: Uuid;
  kind: 'openAgent';
  labelCode: 'open_agent';
  entryPoint: AgentEntryPoint;
  requiresConfirmation: true;
}

export interface AgentPersistedHideSpamAssetsActionV1 {
  id: Uuid;
  kind: 'hideSpamAssets';
  labelCode: 'hide_spam_assets';
  effect: 'live_only';
  requiresConfirmation: false;
}
