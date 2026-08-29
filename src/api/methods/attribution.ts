import type { createStorage } from '../storages';
import type { ApiInitArgs } from '../types';

import { IS_EXTENSION } from '../../config';
import { callBackendPost } from '../common/backend';
import { getEnvironment } from '../environment';

// Client-side channel allowlist - mirror the server (spec section 10) so a stray utm_source
// (e.g. a live iOS `youtube` campaign) is never POSTed and never 400-loops the endpoint. Keep in
// sync with the backend ATTRIBUTION_CHANNELS.
const ATTRIBUTION_CHANNELS = ['wc', 'probe_web', 'probe_tg', 'probe_x', 'probe_yt'];

export function isAllowedChannel(channel: string): boolean {
  return ATTRIBUTION_CHANNELS.includes(channel);
}

// clientId rides the X-App-ClientID header automatically (getBackendHeaders); keep it out of the body.
// Returns whether the backend durably accepted the claim (ok:true). The caller records the
// once-per-install flag only on true and re-claims from the persisted channel on the next init
// otherwise, so a single POST per init is enough and no in-session retry is requested.
export async function claimAttribution(channel: string, platform: string): Promise<boolean> {
  const res = await callBackendPost<{ ok: boolean }>('/attribution/claim', { channel, platform });
  return Boolean(res?.ok);
}

let attributionClaimInFlight = false;

// Persist the first-seen channel, then replay the claim from storage on every init until it is durably
// accepted. The URL param is present only at first load, so storage - not the URL - is what makes a
// deferred claim eventually land. This runs void-ed from init, so the whole body is guarded: a storage
// or network failure resolves quietly and lets the next init retry, and never rejects into the init flow.
export async function claimInstallAttribution(
  args: ApiInitArgs,
  runtimeStorage: ReturnType<typeof createStorage>,
) {
  try {
    // Capture the channel from the URL the first time we see a valid one (client allowlist, spec section 10).
    // This first-seen write stays outside the latch: it must run even while a claim is in flight. A
    // cross-tab race here (two tabs, two different utm_source, same instant) is negligible and accepted.
    if (args.channel && isAllowedChannel(args.channel) && !(await runtimeStorage.getItem('attributionChannel'))) {
      await runtimeStorage.setItem('attributionChannel', args.channel);
    }

    if (attributionClaimInFlight) return; // in-flight latch: reconnect/re-init cannot double-POST
    // Reserve synchronously, before any await, so a second init interleaving on the microtask queue
    // sees the latch already taken and does not double-POST. Rolled back in `finally`.
    attributionClaimInFlight = true;
    try {
      if (await runtimeStorage.getItem('attributionClaimed')) return; // already durably accepted
      const channel = await runtimeStorage.getItem('attributionChannel');
      // Re-validate the stored value against the allowlist: a leftover or tampered channel must not reach
      // the endpoint and 400-loop it on every init.
      if (!channel || !isAllowedChannel(channel)) return;

      const env = getEnvironment();
      const platform = env.isIosApp ? 'ios'
        : env.isAndroidApp ? 'android'
          : IS_EXTENSION ? 'extension'
            : env.isElectron ? 'electron'
              : 'web';
      const ok = await claimAttribution(channel, platform);
      if (ok) await runtimeStorage.setItem('attributionClaimed', '1'); // flag only on durable accept
    } finally {
      attributionClaimInFlight = false;
    }
  } catch {
    // Storage or network failure: the flag stays unset, so the next init replays from the persisted channel.
  }
}

// Entry point for the native Android bridge (window.airBridge.setInstallChannel): the Play Install
// Referrer resolves asynchronously, after page load, so it cannot ride the initial `init()` args like
// the URL-borne channel does. It reuses the exact same claim plumbing - allowlist re-validation, the
// in-flight latch, durable retry, `attributionClaimed` idempotency - so this is a call-site, not a copy.
// `claimInstallAttribution` never throws (self-guarded), so no extra try/catch is needed here.
export async function setInstallChannel(
  channel: string,
  runtimeStorage: ReturnType<typeof createStorage>,
) {
  await claimInstallAttribution({ channel }, runtimeStorage);
}
