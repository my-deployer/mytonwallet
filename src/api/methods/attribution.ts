import type { createStorage } from '../storages';
import type { ApiInitArgs } from '../types';

import { IS_EXTENSION } from '../../config';
import { callBackendPost } from '../common/backend';
import { getEnvironment } from '../environment';

// Mirror the backend slug shape so a malformed or untrusted channel is never POSTed. Any
// well-formed bucket is claimed; the backend maps unrecognised ones.
const CHANNEL_FORMAT = /^[a-z0-9_]{1,64}$/;

export function isAllowedChannel(channel: string): boolean {
  return CHANNEL_FORMAT.test(channel);
}

// clientId rides the X-App-ClientID header (getBackendHeaders), not the body.
export async function claimAttribution(channel: string, platform: string): Promise<boolean> {
  const res = await callBackendPost<{ ok: boolean }>('/attribution/claim', { channel, platform });
  return Boolean(res?.ok);
}

let attributionClaimInFlight = false;

// Replay the claim from the stored channel each init until the backend durably accepts; the URL param
// exists only at first load. Void-ed from init, so the body never rejects into the init flow.
export async function claimInstallAttribution(
  args: ApiInitArgs,
  runtimeStorage: ReturnType<typeof createStorage>,
) {
  try {
    // First-seen capture stays outside the latch: it must run even while a claim is in flight. The
    // cross-tab race (two tabs, two utm_source, same instant) is accepted.
    if (args.channel && isAllowedChannel(args.channel) && !(await runtimeStorage.getItem('attributionChannel'))) {
      await runtimeStorage.setItem('attributionChannel', args.channel);
    }

    if (attributionClaimInFlight) return;
    // Reserve synchronously before any await so an interleaving init sees the latch taken and cannot
    // double-POST; rolled back in `finally`.
    attributionClaimInFlight = true;
    try {
      if (await runtimeStorage.getItem('attributionClaimed')) return;
      const channel = await runtimeStorage.getItem('attributionChannel');
      // Re-validate the stored value: a leftover or tampered channel must not 400-loop the endpoint.
      if (!channel || !isAllowedChannel(channel)) return;

      const env = getEnvironment();
      const platform = env.isIosApp ? 'ios'
        : env.isAndroidApp ? 'android'
          : IS_EXTENSION ? 'extension'
            : env.isElectron ? 'electron'
              : 'web';
      const ok = await claimAttribution(channel, platform);
      if (ok) await runtimeStorage.setItem('attributionClaimed', '1');
    } finally {
      attributionClaimInFlight = false;
    }
  } catch {
    // Storage or network failure: the flag stays unset and the next init replays.
  }
}

// Native Android bridge entry (window.airBridge.setInstallChannel): the Play referrer resolves
// asynchronously, so it cannot ride the initial `init()` args. Reuses the same claim plumbing.
export async function setInstallChannel(
  channel: string,
  runtimeStorage: ReturnType<typeof createStorage>,
) {
  await claimInstallAttribution({ channel }, runtimeStorage);
}
