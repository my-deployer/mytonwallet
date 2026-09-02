import type { StakingPoolConfigUnpacked } from '../chains/ton/contracts/JettonStaking/StakingPool';
import type { ApiStakingJettonPool, ApiYieldType } from '../types';

import { TON_USDE, TONCOIN } from '../../config';
import { raceWithAbortSignal } from '../../util/abortSignal';
import { getIsNewStakeAllowed } from '../../util/staking';
import calcJettonStakingApr from '../../util/ton/calcJettonStakingApr';
import { chains } from '../chains';
import { unpackDicts } from '../chains/ton/util/tonCore';
import { getTokenByAddress } from '../common/tokens';

export interface AgentStakingCatalogProduct {
  productId: string;
  tokenSlug: string;
  annualYield: number;
  yieldType: ApiYieldType;
  depositAvailability: 'available' | 'disabled';
  disabledReason?: 'deposits_closed' | 'protocol_disabled';
}

export interface AgentStakingProductCatalog {
  products: AgentStakingCatalogProduct[];
  hasPartialCoverage: boolean;
}

export async function fetchAgentStakingCatalog(signal?: AbortSignal): Promise<AgentStakingProductCatalog> {
  const staking = chains.ton?.staking;
  if (!staking) throw new Error('TON staking is unavailable');

  const commonData = await raceWithAbortSignal(() => staking.getCommonData(), signal);
  const products: AgentStakingCatalogProduct[] = [{
    productId: 'liquid',
    tokenSlug: TONCOIN.slug,
    annualYield: commonData.liquid.apy,
    yieldType: 'APY',
    depositAvailability: 'available',
  }];

  let hasPartialCoverage = false;
  for (const pool of commonData.jettonPools) {
    const token = getTokenByAddress(pool.token);
    if (!token) {
      hasPartialCoverage = true;
      continue;
    }

    const annualYield = calculateJettonPoolAnnualYield(pool.poolConfig, token.decimals);
    const isAvailable = getIsNewStakeAllowed(token.slug);
    products.push({
      productId: pool.pool,
      tokenSlug: token.slug,
      annualYield,
      yieldType: 'APR',
      depositAvailability: isAvailable ? 'available' : 'disabled',
      ...(!isAvailable ? { disabledReason: 'deposits_closed' as const } : {}),
    });
  }

  products.push({
    productId: 'ethena',
    tokenSlug: TON_USDE.slug,
    annualYield: commonData.ethena.apy,
    yieldType: 'APY',
    depositAvailability: commonData.ethena.isDisabled ? 'disabled' : 'available',
    ...(commonData.ethena.isDisabled ? { disabledReason: 'protocol_disabled' as const } : {}),
  });

  return { products, hasPartialCoverage };
}

function calculateJettonPoolAnnualYield(
  poolConfig: ApiStakingJettonPool['poolConfig'],
  decimals: number,
) {
  const { tvl, rewardJettons } = unpackDicts(poolConfig) as StakingPoolConfigUnpacked;
  const rewardsDeposits = Object.values(rewardJettons ?? {})[0]?.rewardsDeposits ?? {};
  const now = Math.floor(Date.now() / 1000);
  let dailyReward = 0n;

  for (const { startTime, endTime, distributionSpeed } of Object.values(rewardsDeposits)) {
    if (startTime < now && endTime > now) {
      dailyReward += distributionSpeed;
    }
  }

  return calcJettonStakingApr({ tvl, dailyReward, decimals });
}
