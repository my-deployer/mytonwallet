import { Address } from '@ton/core';

import type { ApiNetwork } from '../../types';
import { ApiCommonError } from '../../types';

import { raceWithAbortSignal, throwIfAborted } from '../../../util/abortSignal';
import { getDnsDomainZone, isTonChainDns } from '../../../util/dns';
import { dnsResolve } from './util/dns';
import { getTonClient, toBase64Address } from './util/tonCore';
import { getKnownAddressInfo } from '../../common/addresses';
import { DnsCategory } from './constants';
import { fetchAddressBook } from './toncenter';

export async function resolveAddress(
  network: ApiNetwork,
  address: string,
  skipFormatSelection?: boolean,
  signal?: AbortSignal,
): Promise<{
  address: string;
  name?: string;
  isMemoRequired?: boolean;
  isScam?: boolean;
} | { error: ApiCommonError }> {
  const isDomain = isTonChainDns(address);
  let domain: string | undefined;

  if (isDomain) {
    const resolvedAddress = await resolveAddressByDomain(network, address, signal);
    if (!resolvedAddress) {
      return { error: ApiCommonError.DomainNotResolved };
    }

    domain = address;
    address = resolvedAddress;

    if (!skipFormatSelection) {
      const addressBook = await fetchAddressBook(network, [address], signal);
      address = addressBook[address].user_friendly;
    }
  }

  let normalizedAddress: string;
  try {
    normalizedAddress = normalizeAddress(address, network);
  } catch {
    return { error: ApiCommonError.InvalidAddress };
  }
  const known = getKnownAddressInfo(normalizedAddress);

  if (known) {
    return {
      address,
      ...known,
      name: domain ?? known.name,
    };
  }

  return { address, name: domain };
}

export async function resolveAddressByDomain(network: ApiNetwork, domain: string, signal?: AbortSignal) {
  try {
    const zoneMatch = getDnsDomainZone(domain);
    if (!zoneMatch) {
      return undefined;
    }

    const result = await raceWithAbortSignal(() => dnsResolve(
      getTonClient(network),
      zoneMatch.zone.resolver,
      zoneMatch.base,
      DnsCategory.Wallet,
    ), signal);

    if (!(result instanceof Address)) {
      return undefined;
    }

    return toBase64Address(result, undefined, network);
  } catch (err: any) {
    throwIfAborted(signal);
    if (!err.message?.includes('exit_code')) {
      throw err;
    }
    return undefined;
  }
}

export function normalizeAddress(address: string, network?: ApiNetwork) {
  return toBase64Address(address, true, network);
}
