import type {
  AgentActionKind,
  AgentAssetRefV2,
  AgentEventType,
  AgentRunUserMessage,
  AgentStarterHintIdV2,
  AgentToolCapability,
  UtcTimestampMs,
  Uuid,
  UuidInput,
} from './shared';

export type AgentEntryPoint =
  | {
    kind: 'agentTab';
  }
  | {
    kind: 'portfolioChart';
    source?: 'analyzeIt' | 'manual';
    chartId: string;
    range: '1d' | '7d' | '1m' | '3m' | '1y' | 'all';
    accountScope?: 'current';
    datasetFocus?: {
      datasetId?: string;
      assetSlug?: string;
      chain?: string;
    };
  }
  | {
    kind: 'tokenScreen';
    asset: AgentAssetRefV2;
  }
  | {
    kind: 'globalSearch';
    query: string;
  }
  | {
    kind: 'emptyState';
    surface: 'agentTab';
    hintId?: AgentStarterHintIdV2;
    catalogVersion?: string;
  };

export type AgentCapabilities = Record<string, unknown> & {
  supportedEventTypes?: unknown[];
} & {
  protocolVersion: 2;
  streamFormat: 'ndjson';
  /**
   * @minItems 1
   * @maxItems 14
   */
  supportedEventTypes: AgentEventType[];
  /**
   * @maxItems 12
   */
  supportedTools: AgentToolCapability[];
  /**
   * @maxItems 9
   */
  supportedActions: AgentActionKind[];
  receiveActionVersion?: 3;
  supportsFollowups: boolean;
  supportsInputContinuations?: boolean;
  supportsMessageEdit: boolean;
  supportsRegenerate: boolean;
  supportsAgentCapacityError?: boolean;
  supportsUserQuotaError?: boolean;
  supportsLocalAgent?: boolean;
};

export type AgentServerWebSearchStatusV1 = 'available' | 'disabled' | 'unavailable';

export type AgentIntentSource = Record<string, unknown> & {
  kind: 'userMessage' | 'actionFollowup';
  messageId: Uuid;
  followupId?: string;
};

export type Freshness = {
  isStale: boolean;
  source: 'fresh_fetch' | 'memory_cache' | 'stale_cache';
  asOf: UtcTimestampMs;
  maxStaleMs: number;
} & (
  | {
    source: 'fresh_fetch' | 'memory_cache';
    isStale: false;
  }
  | {
    source: 'stale_cache';
    isStale: true;
  }
);

export interface AgentClientUnsupportedContentV1 {
  kind: 'clientUnsupported';
  schemaVersion: 1;
}

export type AgentRunInputV2 =
  | {
    kind: 'append';
    message: AgentRunUserMessage;
  }
  | {
    kind: 'edit';
    targetUserMessageId: UuidInput;
    message: AgentRunUserMessage;
  }
  | {
    kind: 'regenerate';
    targetAssistantMessageId: UuidInput;
  };

export interface AgentContext {
  platform: 'classic' | 'ios' | 'android';
  client: 'web' | 'electron' | 'extension' | 'tma' | 'native' | 'capacitor';
  lang: string;
  baseCurrency: string;
  appName?: 'My Wallet' | 'Gram Wallet';
  timeZone?: string;
  appVersion?: string;
  knowledgeBaseVersion?: string;
  theme?: string;
  /**
   * @maxItems 16
   */
  activeWalletChains?: string[];
  permissions: AgentContextPermissions;
}

export interface AgentContextPermissions {
  agentConsentAccepted: boolean;
}

export interface AgentServerCapabilitiesV2 {
  webSearch: AgentServerWebSearchStatusV1;
}

export interface EntryPoint {
  kind: 'portfolioChart' | 'agentTab';
  chartId?: string;
  source?: 'analyzeIt' | 'manual';
}

export interface AgentScopeIntentV2 {
  messageId: Uuid;
  reason: 'selected_wallet_query' | 'explicit_all_wallet_query';
}

export interface AgentUserQuotaV2 {
  limit: number;
  used: number;
  remaining: number;
  resetAt: UtcTimestampMs;
}
