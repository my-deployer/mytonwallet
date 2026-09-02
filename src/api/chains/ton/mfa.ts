import { Address, contractAddress } from '@ton/core';
import { WalletContractV5R1 } from '@ton/ton/dist/wallets/WalletContractV5R1';

import type { ApiNetwork } from '../../types';

import { parseAccountId } from '../../../util/account';
import { logDebugError } from '../../../util/logs';
import { sendExternal } from './util/sendExternal';
import { getSigner } from './util/signer';
import { getTonClient } from './util/tonCore';
import { getContractCode, MfaExtension, mfaExtensionConfigToCell } from './contracts/MfaExtension';
import { resolveMfaExtensionAddress } from './contracts/util';
import { fetchStoredChainAccount } from '../../common/accounts';
import { withoutTransferConcurrency } from '../../common/preventTransferConcurrency';
import { resolveTransactionError } from './transfer';
import { getTonWallet, getWalletInfo } from './wallet';

/** Resolves the MFA extension address from a string wallet address (universal-interface friendly). */
export function resolveExtensionAddress(network: ApiNetwork, walletAddress: string) {
  return resolveMfaExtensionAddress(network, Address.parse(walletAddress));
}

export async function createRemoveMfaExtensionPayload(accountId: string, enclaveToken?: string) {
  const account = await fetchStoredChainAccount(accountId, 'ton');
  const signer = getSigner(accountId, account, enclaveToken);
  const wallet = getTonWallet(account.byChain.ton);
  const { network } = parseAccountId(accountId);
  const { mfa } = account.byChain.ton;

  if (!mfa) return { error: 'Mfa Extension is not installed!' };
  if (!(wallet instanceof WalletContractV5R1)) {
    return { error: 'Only V5R1 wallets supported!' };
  }

  const mfaExtension = getTonClient(network).open(
    MfaExtension.createFromAddress(Address.parse(mfa.address)),
  );
  const mfaExtensionSeqno = await mfaExtension.getSeqno();

  return await signer.signRemoveMfaRequest(mfaExtensionSeqno);
}

export async function installMfaExtension(
  accountId: string,
  telegramId: string,
  enclaveToken?: string,
) {
  const account = await fetchStoredChainAccount(accountId, 'ton');
  const signer = getSigner(accountId, account, enclaveToken);
  const wallet = getTonWallet(account.byChain.ton);
  const { network } = parseAccountId(accountId);
  const { address: fromAddress } = account.byChain.ton;

  if (!(wallet instanceof WalletContractV5R1)) {
    return { error: 'Only V5R1 wallets supported!' };
  }

  const code = getContractCode();
  const data = mfaExtensionConfigToCell({
    telegramId,
    walletAddress: wallet.address,
    seedPubkey: wallet.publicKey,
  });
  const init = { code, data };

  try {
    return await withoutTransferConcurrency(network, fromAddress, async (finalizeInBackground) => {
      const { seqno } = await getWalletInfo(network, wallet);

      const request = await signer.signInstallMfaRequest(init, seqno);
      if ('error' in request) return request;

      const client = getTonClient(network);
      const { msgHash, msgHashNormalized } = await sendExternal(client, wallet, request);

      const address = contractAddress(0, init);

      return {
        txId: msgHashNormalized,
        msgHashForCexSwap: msgHash,
        localActivityParams: {
          externalMsgHashNorm: msgHashNormalized,
        },
        mfaContractAddress: address.toRawString(),
      };
    });
  } catch (err) {
    logDebugError('installMfaExtension', err);

    return { error: resolveTransactionError(err) };
  }
}
