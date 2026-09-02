import type { ApiInitArgs, OnApiUpdate } from '../../types';
import type { MethodArgsWithMaybePrefix, MethodResponseWithMaybePrefix } from '../../types/methods';
import { type AllMethods, recognizeDappMethod } from '../../types/methods';

import { getProtocolManager } from '../../dappProtocols';
import { setInstallChannel as claimInstallChannel } from '../../methods/attribution';
import init from '../../methods/init';
import { methods } from '../../methods/registry';
import { createStorage, withStorage } from '../../storages';

export function createDirectApiConnector() {
  let initPromise: Promise<void> | undefined;
  let runtimeStorage = createStorage();

  function initApi(onUpdate: OnApiUpdate, initArgs: ApiInitArgs | (() => ApiInitArgs)) {
    const args = typeof initArgs === 'function' ? initArgs() : initArgs;

    runtimeStorage = createStorage(args.storage);
    initPromise = withStorage(runtimeStorage, () => init(onUpdate, args));
  }

  // Native Android calls this once the Play Install Referrer resolves (after initApi, after page
  // load), so it cannot ride the initApi args. `runtimeStorage` is read here, not captured at
  // definition time, so this always targets whichever instance the most recent initApi call created.
  // Native calls this only after initApi; if it somehow arrives before, there is no init to wait
  // on and no storage context to claim against, so no-op rather than claim against the default.
  // Stays fire-and-forget (`=> void`): the JS bridge calls this and ignores the return. The trailing
  // catch is not about the claim (claimInstallChannel already self-guards) - it is there so a
  // rejected initPromise (init() itself failing) cannot surface as an unhandled promise rejection.
  function setInstallChannel(channel: string) {
    if (!initPromise) return;
    void initPromise
      .then(() => claimInstallChannel(channel, runtimeStorage))
      .catch(() => {});
  }

  async function callApi<T extends keyof AllMethods>(
    fnName: T,
    ...args: MethodArgsWithMaybePrefix<T>
  ): Promise<MethodResponseWithMaybePrefix<T>> {
    await initPromise!;

    return withStorage(runtimeStorage, () => {
      const parsedRequest = recognizeDappMethod(fnName);

      if (parsedRequest.isDapp) {
        const adapter = getProtocolManager().getAdapter(parsedRequest.protocolType);
        if (!adapter) {
          throw new Error('No dApp adapter found for request');
        }
        const method = adapter[parsedRequest.fnName].bind(adapter);

        // @ts-ignore
        return method(...args);
      }
      // @ts-ignore
      return methods[fnName](...args) as MethodResponseWithMaybePrefix<T>;
    });
  }

  return {
    initApi,
    callApi,
    setInstallChannel,
  };
}

const defaultConnector = createDirectApiConnector();

export const { initApi, callApi, setInstallChannel } = defaultConnector;
