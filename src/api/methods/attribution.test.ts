const mockCallBackendPost = jest.fn();
const mockGetEnvironment = jest.fn(() => ({ isIosApp: false, isAndroidApp: false, isElectron: false }));

jest.mock('../common/backend', () => ({
  callBackendPost: (...args: unknown[]) => mockCallBackendPost(...args),
}));

jest.mock('../environment', () => ({
  getEnvironment: () => mockGetEnvironment(),
}));

import type { createStorage } from '../storages';
import type { ApiInitArgs } from '../types';

import { claimAttribution, claimInstallAttribution, isAllowedChannel, setInstallChannel } from './attribution';

function makeStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: jest.fn((k: string) => Promise.resolve(map.get(k))),
    setItem: jest.fn((k: string, v: string) => {
      map.set(k, v);
      return Promise.resolve();
    }),
    _map: map,
  } as unknown as ReturnType<typeof createStorage> & { _map: Map<string, string> };
}

const argsWith = (channel?: string) => ({ channel } as unknown as ApiInitArgs);

describe('claimAttribution', () => {
  afterEach(() => {
    mockCallBackendPost.mockReset();
  });

  it('posts channel + platform and returns true when the backend accepts', async () => {
    mockCallBackendPost.mockResolvedValue({ ok: true });
    const ok = await claimAttribution('wc', 'web');
    expect(mockCallBackendPost).toHaveBeenCalledWith(
      '/attribution/claim', { channel: 'wc', platform: 'web' },
    );
    expect(ok).toBe(true);
  });

  it('returns false when the backend defers (ok:false)', async () => {
    mockCallBackendPost.mockResolvedValue({ ok: false });
    expect(await claimAttribution('wc', 'web')).toBe(false);
  });
});

describe('isAllowedChannel', () => {
  it('accepts provisioned channels and rejects everything else', () => {
    expect(isAllowedChannel('wc')).toBe(true);
    expect(isAllowedChannel('probe_web')).toBe(true);
    expect(isAllowedChannel('probe_tg')).toBe(true);
    expect(isAllowedChannel('probe_x')).toBe(true);
    expect(isAllowedChannel('probe_yt')).toBe(true);
    expect(isAllowedChannel('youtube')).toBe(false); // a live iOS campaign, not a claim channel
    expect(isAllowedChannel('WC')).toBe(false);
    expect(isAllowedChannel('')).toBe(false);
  });
});

describe('claimInstallAttribution', () => {
  afterEach(() => {
    mockCallBackendPost.mockReset();
  });

  it('first sight persists the channel, then claims', async () => {
    const storage = makeStorage();
    mockCallBackendPost.mockResolvedValue({ ok: true });

    await claimInstallAttribution(argsWith('wc'), storage);

    expect(storage._map.get('attributionChannel')).toBe('wc');
    expect(mockCallBackendPost).toHaveBeenCalledWith(
      '/attribution/claim', { channel: 'wc', platform: 'web' },
    );
    expect(storage._map.get('attributionClaimed')).toBe('1');
  });

  it('disallowed channel is neither persisted nor POSTed', async () => {
    const storage = makeStorage();

    await claimInstallAttribution(argsWith('youtube'), storage);

    expect(storage._map.get('attributionChannel')).toBeUndefined();
    expect(mockCallBackendPost).not.toHaveBeenCalled();
  });

  it('replays from storage claims without a URL channel', async () => {
    const storage = makeStorage({ attributionChannel: 'wc' });
    mockCallBackendPost.mockResolvedValue({ ok: true });

    await claimInstallAttribution(argsWith(undefined), storage);

    expect(mockCallBackendPost).toHaveBeenCalledWith(
      '/attribution/claim', { channel: 'wc', platform: 'web' },
    );
    expect(storage._map.get('attributionClaimed')).toBe('1');
  });

  it('ok:false leaves the flag unset and the channel intact', async () => {
    const storage = makeStorage({ attributionChannel: 'wc' });
    mockCallBackendPost.mockResolvedValue({ ok: false });

    await claimInstallAttribution(argsWith(undefined), storage);

    expect(storage._map.get('attributionClaimed')).toBeUndefined();
    expect(storage._map.get('attributionChannel')).toBe('wc');
  });

  it('already-claimed short-circuits', async () => {
    const storage = makeStorage({ attributionChannel: 'wc', attributionClaimed: '1' });

    await claimInstallAttribution(argsWith(undefined), storage);

    expect(mockCallBackendPost).not.toHaveBeenCalled();
  });

  it('organic (no channel) does nothing', async () => {
    const storage = makeStorage();

    await claimInstallAttribution(argsWith(undefined), storage);

    expect(mockCallBackendPost).not.toHaveBeenCalled();
  });

  it('re-validates a stale or tampered persisted channel and never POSTs it', async () => {
    const storage = makeStorage({ attributionChannel: 'youtube' }); // leftover from an older build

    await claimInstallAttribution(argsWith(undefined), storage);

    expect(mockCallBackendPost).not.toHaveBeenCalled();
    expect(storage._map.get('attributionClaimed')).toBeUndefined();
  });

  it('resolves quietly when storage throws, without rejecting into init', async () => {
    const storage = {
      getItem: jest.fn(() => Promise.reject(new Error('storage unavailable'))),
      setItem: jest.fn(() => Promise.resolve()),
    } as unknown as ReturnType<typeof createStorage>;

    await expect(claimInstallAttribution(argsWith('wc'), storage)).resolves.toBeUndefined();
    expect(mockCallBackendPost).not.toHaveBeenCalled();
  });

  it('in-flight latch: two overlapping calls POST once', async () => {
    // Regression test for the TOCTOU race: the latch must reserve synchronously, before
    // any await, so two near-simultaneous init() calls cannot both pass the guard.
    const storage = makeStorage({ attributionChannel: 'wc' });

    let resolvePost!: (v: unknown) => void;
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });
    mockCallBackendPost.mockReturnValue(postPromise);

    const p1 = claimInstallAttribution(argsWith(undefined), storage);
    const p2 = claimInstallAttribution(argsWith(undefined), storage);

    // let both run up to their awaits
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockCallBackendPost).toHaveBeenCalledTimes(1);

    resolvePost({ ok: true });
    await Promise.all([p1, p2]);
  });
});

describe('setInstallChannel (android)', () => {
  beforeEach(() => {
    mockGetEnvironment.mockReturnValue({ isIosApp: false, isAndroidApp: true, isElectron: false });
  });

  afterEach(() => {
    mockCallBackendPost.mockReset();
    mockGetEnvironment.mockReturnValue({ isIosApp: false, isAndroidApp: false, isElectron: false });
  });

  it('setInstallChannel claims an allowlisted channel on android', async () => {
    mockCallBackendPost.mockResolvedValue({ ok: true });
    const storage = makeStorage();
    await setInstallChannel('wc', storage);
    expect(mockCallBackendPost).toHaveBeenCalledWith('/attribution/claim', { channel: 'wc', platform: 'android' });
    expect(storage._map.get('attributionClaimed')).toBe('1');
  });

  it('setInstallChannel drops a disallowed channel', async () => {
    const storage = makeStorage();
    await setInstallChannel('youtube', storage);
    expect(mockCallBackendPost).not.toHaveBeenCalled();
  });
});
