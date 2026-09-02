import type { ApiInitArgs, OnApiUpdate } from '../types';

import { initWindowConnector } from '../../util/windowProvider/connector';
import { fetchBackendReferrer } from '../common/backend';
import { connectUpdater, disconnectUpdater, tryMigrateStorage } from '../common/helpers';
import { initClientId } from '../common/other';
import { getProtocolManager, initProtocolManager } from '../dappProtocols';
import { setEnvironment } from '../environment';
import { addHooks } from '../hooks';
import { configureStorage, createStorage, withStorage } from '../storages';
import { claimInstallAttribution } from './attribution';
import { destroyPolling } from './polling';
import * as methods from '.';

export default async function init(onUpdate: OnApiUpdate, args: ApiInitArgs) {
  const runtimeStorage = createStorage(args.storage);

  configureStorage(args.storage);
  connectUpdater(onUpdate);

  const environment = setEnvironment(args);
  initWindowConnector();

  if (args.langCode) {
    await runtimeStorage.setItem('langCode', args.langCode);
  }

  await withStorage(runtimeStorage, async () => {
    await initClientId();
    await tryMigrateStorage(onUpdate, args.accountIds);
  });

  methods.initAccounts(onUpdate);
  methods.initAuth(onUpdate);
  methods.initPolling(onUpdate);
  methods.initTransfer(onUpdate);
  methods.initTokens(onUpdate);
  methods.initNfts(onUpdate);
  if (process.env.NO_EXTRA_FEATURES !== '1') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const extra = require('./extra') as typeof import('./extra');
    extra.initMfa(onUpdate);
    extra.initStaking();
    extra.initSwap(onUpdate);
  }
  if (process.env.NO_EXTRA_FEATURES !== '1') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initAgentV2IfEnabled } = require('./agentV2Lifecycle') as typeof import('./agentV2Lifecycle');
    await initAgentV2IfEnabled(onUpdate);
  }

  await initProtocolManager(onUpdate, environment);

  if (environment.isDappSupported) {
    methods.initDapps(onUpdate);
  }

  const protocolManager = getProtocolManager();

  addHooks({
    onDappDisconnected: protocolManager.closeRemoteConnection.bind(protocolManager),
    onDappsChanged: protocolManager.resetupRemoteConnection.bind(protocolManager),
  });

  void saveReferrer(args, runtimeStorage);
  void claimInstallAttribution(args, runtimeStorage);
}

export function destroy() {
  void destroyPolling();
  if (process.env.NO_EXTRA_FEATURES !== '1') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { destroyAgentV2IfEnabled } = require('./agentV2Lifecycle') as typeof import('./agentV2Lifecycle');
    void destroyAgentV2IfEnabled();
  }
  disconnectUpdater();
}

async function saveReferrer(args: ApiInitArgs, runtimeStorage: ReturnType<typeof createStorage>) {
  const referrer = args.referrer ?? await fetchBackendReferrer();

  if (referrer) {
    await runtimeStorage.setItem('referrer', referrer);
    await withStorage(runtimeStorage, async () => {
      await initClientId();
    });
  }
}
