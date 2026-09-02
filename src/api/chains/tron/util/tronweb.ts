import { TronWeb } from 'tronweb';

import type { ApiNetwork } from '../../../types';

import { raceWithAbortSignal } from '../../../../util/abortSignal';
import withCache from '../../../../util/withCache';
import withCacheAsync from '../../../../util/withCacheAsync';
import { NETWORK_CONFIG } from '../constants';

export const getTronClient = withCache((network: ApiNetwork) => {
  return new TronWeb({
    fullHost: NETWORK_CONFIG[network].apiUrl,
  });
});

export const getChainParameters = withCacheAsync(fetchChainParameters);

export async function fetchChainParameters(network: ApiNetwork, signal?: AbortSignal) {
  const chainParameters = await raceWithAbortSignal(
    () => getTronClient(network).trx.getChainParameters(),
    signal,
  );
  const energyUnitFee = chainParameters.find((param) => param.key === 'getEnergyFee')!.value;
  const bandwidthUnitFee = chainParameters.find((param) => param.key === 'getTransactionFee')!.value;
  return { energyUnitFee, bandwidthUnitFee };
}
