import React, { memo } from '../../lib/teact/teact';

import type {
  AgentRunActivityCodeV1,
  AgentToolName,
  AgentWalletSemanticOperationV2,
} from '../../api/agentV2/protocol/types';

import useLang from '../../hooks/useLang';

import styles from './AgentRunActivity.module.scss';

type AgentVisibleRunActivityCode = Exclude<
  AgentRunActivityCodeV1,
  'analysis.checking_freshness' | 'analysis.computing'
>;

export type AgentRunActivityType =
  | { kind: 'analyzingRequest' }
  | { kind: 'tool'; toolName: AgentToolName; operation?: AgentWalletSemanticOperationV2 }
  | { kind: 'server'; code: AgentVisibleRunActivityCode }
  | { kind: 'preparingResponse' };

const TOOL_ACTIVITY_LANG_KEY: Record<AgentToolName, string> = {
  'wallet.data.query': '$agent_activity_wallet',
  'wallet.directory.query': '$agent_activity_wallet',
  'action.send.prepare': '$agent_activity_transfer',
  'action.swap.prepare': '$agent_activity_swap',
  'market.asset.quote': '$agent_activity_market_quote',
  'staking.offer.read': '$agent_activity_wallet',
  'staking.offers.list': '$agent_activity_wallet',
};

const QUERY_ACTIVITY_LANG_KEY: Record<AgentWalletSemanticOperationV2, string> = {
  'account.inventory': '$agent_activity_wallet',
  'assets.search': '$agent_activity_assets',
  'positions.list': '$agent_activity_wallet',
  'portfolio.aggregate': '$agent_activity_portfolio',
  'transactions.list': '$agent_activity_transactions',
  'transactions.detail': '$agent_activity_transactions',
  'contacts.list': '$agent_activity_addresses',
  'value.series': '$agent_activity_portfolio',
};

const SERVER_ACTIVITY_LANG_KEY: Record<AgentVisibleRunActivityCode, string> = {
  'request.planning': '$agent_activity_planning',
  'web.searching': '$agent_activity_web_searching',
  'web.reading_sources': '$agent_activity_web_reading_sources',
  'data.reading_market': '$agent_activity_market_data',
  'answer.writing': '$agent_activity_writing',
};

interface OwnProps {
  activity: AgentRunActivityType;
}

function AgentRunActivity({ activity }: OwnProps) {
  const lang = useLang();
  const langKey = getActivityLangKey(activity);

  return (
    <div className={styles.root} role="status" aria-live="polite" aria-atomic="true">
      <span className={styles.indicator} aria-hidden />
      <span className={styles.text}>{lang(langKey)}</span>
    </div>
  );
}

function getActivityLangKey(activity: AgentRunActivityType) {
  if (activity.kind === 'server') return SERVER_ACTIVITY_LANG_KEY[activity.code];
  if (activity.kind === 'tool') {
    return activity.operation
      ? QUERY_ACTIVITY_LANG_KEY[activity.operation]
      : TOOL_ACTIVITY_LANG_KEY[activity.toolName];
  }
  return activity.kind === 'preparingResponse'
    ? '$agent_activity_preparing_response'
    : '$agent_activity_analyzing_request';
}

export default memo(AgentRunActivity);
