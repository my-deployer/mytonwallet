import type { AgentV2SessionStorage } from './sessionStorage';
import type { AgentV2HostContextSnapshot } from './types';

import { APP_NAME } from '../../config';
import contractManifest from './generated/manifest.json';
import { AgentV2WalletSession, createAgentV2WalletSession } from './walletSession';

const WALLET_SESSION_STORAGE_KEY = 'agentV2WalletSession';
const LEGACY_SESSION_ID = '11111111-1111-4111-8111-111111111111';
const CURRENT_SESSION_ID = '22222222-2222-4222-8222-222222222222';

describe('AgentV2WalletSession semantic capabilities', () => {
  beforeEach(() => sessionStorage.clear());

  it('advertises the validated current application identity', () => {
    const session = new AgentV2WalletSession();
    session.update(hostContext());

    expect(session.buildContext().context.appName).toBe(APP_NAME);
  });

  it.each(['classic', 'ios'] as const)('advertises semantic content without renderer handshakes on %s', (platform) => {
    const session = new AgentV2WalletSession();
    session.update({ ...hostContext(), platform });
    const { capabilities } = session.buildContext();

    expect(capabilities.supportedEventTypes).toContain('semantic_content');
    expect(capabilities.supportedEventTypes).toContain('run_activity');
    expect(capabilities).not.toHaveProperty('supportedWidgets');
    expect(capabilities).not.toHaveProperty('supportedTextFormats');
    expect(capabilities).not.toHaveProperty('presentation');
  });

  it('does not advertise follow-up presentation on unsupported clients', () => {
    const session = new AgentV2WalletSession();
    session.update({ ...hostContext(), platform: 'android', client: 'native' });

    const { capabilities } = session.buildContext();

    expect(capabilities.supportsFollowups).toBe(false);
    expect(capabilities.supportedEventTypes).not.toContain('followups');
    expect(capabilities.supportsInputContinuations).toBe(false);
    expect(capabilities.supportedEventTypes).not.toContain('input_continuations');
  });

  it('advertises only supported presentation events without a wallet host', () => {
    const session = new AgentV2WalletSession();

    const { capabilities } = session.buildContext();

    expect(capabilities.supportsFollowups).toBe(false);
    expect(capabilities.supportedEventTypes).not.toContain('followups');
    expect(capabilities.supportsInputContinuations).toBe(true);
    expect(capabilities.supportedEventTypes).toContain('input_continuations');
  });

  it.each(['classic', 'ios'] as const)(
    'advertises model-owned follow-ups on %s',
    (platform) => {
      const session = new AgentV2WalletSession();
      session.update({ ...hostContext(), platform });

      expect(session.buildContext().capabilities).toMatchObject({
        supportsFollowups: true,
        supportedEventTypes: expect.arrayContaining(['followups']),
      });
    },
  );

  it('admits wallet query V5 without presentation negotiation once the server contract is ready', () => {
    const session = new AgentV2WalletSession();
    session.update(hostContext());
    enableWalletQuery(session);

    expect(session.buildContext().capabilities.supportedTools).toContainEqual(expect.objectContaining({
      name: 'wallet.data.query', version: 5, timeoutMs: 30_000,
    }));
    expect(session.buildContext().walletContext).not.toHaveProperty('allowedAccountScopes');
  });

  it('advertises quote, wallet query V5, and eligible send preparation', () => {
    const session = new AgentV2WalletSession();
    session.update({ ...hostContext(), platform: 'ios', client: 'native' });
    enableWalletQuery(session);

    const { capabilities, context } = session.buildContext();
    const advertised = capabilities.supportedTools.map(({ name, version }) => `${name}@${version}`).sort();
    expect(advertised).toEqual([
      'action.send.prepare@1',
      'market.asset.quote@1',
      'wallet.data.query@5',
      'wallet.directory.query@1',
    ]);
    expect(context.permissions).toEqual({ agentConsentAccepted: true });
  });

  it.each([
    ['classic', true],
    ['ios', true],
    ['android', false],
  ] as const)('advertises the text-only local market quote tool on %s', (platform, expected) => {
    const session = new AgentV2WalletSession();
    session.update({ ...hostContext(), platform });

    expect(session.buildContext().capabilities.supportedTools.some(({ name }) => name === 'market.asset.quote'))
      .toBe(expected);
  });

  it.each([
    ['classic', true],
    ['ios', true],
    ['android', false],
  ] as const)('advertises the complete wallet directory on %s', (platform, expected) => {
    const session = new AgentV2WalletSession();
    const host = hostContext();
    host.platform = platform;
    host.client = platform === 'classic' ? 'web' : 'native';
    host.accounts.push({
      ...host.accounts[0],
      accountId: 'savings-account',
      label: 'Savings',
      state: 'stale',
    });
    session.update(host);

    expect(session.buildContext().capabilities.supportedTools
      .some(({ name }) => name === 'wallet.directory.query')).toBe(expected);
    if (expected) {
      expect(session.buildWalletDirectory('2026-08-20T00:00:00.000Z')).toMatchObject({
        status: 'complete',
        coverage: { accountsRequested: 2, accountsIncluded: 2, rowsOmitted: 0 },
        accounts: [
          { label: 'Main', isCurrent: true, state: 'active' },
          { label: 'Savings', isCurrent: false, state: 'stale' },
        ],
      });
    }
  });

  it.each([
    ['missing label', undefined],
    ['unsafe label', 'Main\u202Eevil'],
  ])('withdraws the wallet directory for an incomplete %s', (_case, label) => {
    const session = new AgentV2WalletSession();
    const host = hostContext();
    host.accounts[0].label = label;
    session.update(host);

    expect(session.buildContext().capabilities.supportedTools)
      .not.toContainEqual(expect.objectContaining({ name: 'wallet.directory.query' }));
  });

  it('withdraws the market quote tool when local quote data is unavailable', () => {
    const session = new AgentV2WalletSession();
    const host = hostContext();
    delete host.currencyRate;
    session.update(host);

    expect(session.buildContext().capabilities.supportedTools).not.toContainEqual(expect.objectContaining({
      name: 'market.asset.quote',
    }));
  });

  it('keeps the staking offer read inert when an old backend omits negotiation', () => {
    const session = new AgentV2WalletSession();
    session.update(hostContext());
    session.updateFeatureCapabilities('disabled', 'disabled');

    expect(session.buildContext().capabilities.supportedTools).not.toContainEqual(
      expect.objectContaining({ name: 'staking.offer.read' }),
    );
  });

  it('advertises the exact staking offer read for a consented active mainnet session', () => {
    const session = new AgentV2WalletSession();
    const host = hostContext();
    host.accounts[0].accountType = 'viewOnly';
    host.accounts[0].isViewOnly = true;
    host.accounts[0].holdings[0].balance = '0';
    session.update(host);
    session.updateFeatureCapabilities('disabled', 'disabled', 'available');

    expect(session.buildContext().capabilities.supportedTools).toContainEqual({
      name: 'staking.offer.read',
      version: 1,
      scopes: ['staking.data.read'],
      timeoutMs: 15_000,
      maxResultBytes: 16_384,
    });
    expect(JSON.stringify(session.buildContext())).not.toContain('annualYield');
    expect(JSON.stringify(session.buildContext())).not.toContain('stakingOffers');
    const { walletContext } = session.buildContext();
    expect(walletContext.mode).toBe('wallet');
    if (walletContext.mode !== 'wallet') throw new Error('Expected wallet context');
    expect(walletContext.activeAccount.stakingYieldOffers).toEqual([{
      productId: 'liquid',
      asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', decimals: 9 },
    }]);
  });

  it.each([
    ['on testnet', true, true],
    ['without a matching local asset', false, false],
  ] as const)(
    'withdraws the staking offer read %s',
    (_case, isTestnet, hasMatchingAsset) => {
      const session = new AgentV2WalletSession();
      const host = hostContext();
      host.isTestnet = isTestnet;
      if (!hasMatchingAsset) host.assetCatalog = [];
      session.update(host);
      session.updateFeatureCapabilities('disabled', 'disabled', 'available');

      expect(session.buildContext().capabilities.supportedTools).not.toContainEqual(
        expect.objectContaining({ name: 'staking.offer.read' }),
      );
    },
  );

  it('withdraws wallet query V5 when the catalog digest does not match', () => {
    const session = new AgentV2WalletSession();
    session.update(hostContext());
    session.updateFeatureCapabilities('available', 'available');
    session.updateWalletQueryCapabilities({
      status: 'available',
      supportedToolVersions: [5],
      filterCatalog: { version: 1, digest: '0'.repeat(64), requiresClientTimeZone: true },
    });

    expect(session.buildContext().capabilities.supportedTools).not.toContainEqual(expect.objectContaining({
      name: 'wallet.data.query',
    }));
  });

  it.each([
    ['classic', 'web', [
      'send', 'receive', 'stake', 'hideSpamAssets', 'openUrl', 'openToken', 'openTransaction', 'openAgent',
    ], ['send', 'receive', 'stake'], true, false],
    ['ios', 'native', [
      'send', 'receive', 'stake', 'hideSpamAssets', 'openUrl', 'openToken', 'openTransaction', 'openAgent',
    ], ['send', 'receive', 'stake'], false, false],
    ['android', 'native', ['send', 'receive'], ['send', 'receive'], true, true],
  ] as const)(
    'advertises the exact prepared-action matrix on %s',
    (platform, client, supportedActions, walletSupportedActions, supportsMessageEdit, supportsRegenerate) => {
      const session = new AgentV2WalletSession();
      session.update({ ...hostContext(), platform, client });
      session.updateFeatureCapabilities('available', 'available');

      const { capabilities, walletContext } = session.buildContext();

      expect(capabilities.supportedActions).toEqual(supportedActions);
      expect(capabilities.receiveActionVersion).toBe(3);
      expect(capabilities.supportsMessageEdit).toBe(supportsMessageEdit);
      expect(capabilities.supportsRegenerate).toBe(supportsRegenerate);
      expect(capabilities.supportedTools).toContainEqual(expect.objectContaining({
        name: 'action.send.prepare', version: 1,
      }));
      expect(walletContext.mode).toBe('wallet');
      if (walletContext.mode !== 'wallet') throw new Error('Expected wallet context');
      expect(walletContext.activeAccount.supportedActions).toEqual(walletSupportedActions);
    },
  );

  it('keeps answer-driving Classic and iOS capability contracts in parity', () => {
    const classic = new AgentV2WalletSession();
    const ios = new AgentV2WalletSession();
    classic.update({
      ...hostContext(),
      platform: 'classic',
      client: 'web',
      swapAssetCatalog: swapAssetCatalog(),
    });
    ios.update({
      ...hostContext(),
      platform: 'ios',
      client: 'native',
      swapAssetCatalog: swapAssetCatalog(),
    });
    enableWalletQuery(classic);
    enableWalletQuery(ios);
    classic.updateFeatureCapabilities('available', 'available', 'available');
    ios.updateFeatureCapabilities('available', 'available', 'available');

    const classicContext = classic.buildContext();
    const iosContext = ios.buildContext();

    expect(iosContext.capabilities.supportedTools).toEqual(classicContext.capabilities.supportedTools);
    expect(iosContext.capabilities.supportedActions).toEqual(classicContext.capabilities.supportedActions);
    expect(iosContext.capabilities.supportsFollowups).toBe(classicContext.capabilities.supportsFollowups);
    expect(iosContext.capabilities.supportsInputContinuations).toBe(
      classicContext.capabilities.supportsInputContinuations,
    );
    expect(iosContext.walletContext.mode).toBe('wallet');
    expect(classicContext.walletContext.mode).toBe('wallet');
    if (iosContext.walletContext.mode !== 'wallet' || classicContext.walletContext.mode !== 'wallet') {
      throw new Error('Expected wallet contexts');
    }
    expect(iosContext.walletContext.activeAccount.supportedActions).toEqual(
      classicContext.walletContext.activeAccount.supportedActions,
    );
    expect(iosContext.walletContext.activeAccount.stakingOffers).toEqual(
      classicContext.walletContext.activeAccount.stakingOffers,
    );
    // Editing is intentionally excluded from answer-logic parity in the native product.
    expect(iosContext.capabilities.supportsMessageEdit).toBe(false);
    expect(classicContext.capabilities.supportsMessageEdit).toBe(true);
  });

  it.each([
    ['eligible Classic wallet', 'classic', false, 'toncoin', true],
    ['eligible iOS wallet', 'ios', false, 'toncoin', true],
    ['unsupported Android client', 'android', false, 'toncoin', false],
    ['view-only wallet', 'classic', true, 'toncoin', false],
    ['missing local stake asset', 'classic', false, undefined, false],
  ] as const)(
    'advertises Stake only for an %s',
    (_name, platform, isViewOnly, hasStakingOffers, expected) => {
      const session = new AgentV2WalletSession();
      const host = hostContext();
      host.platform = platform;
      host.client = platform === 'classic' ? 'web' : 'native';
      host.accounts[0].accountType = isViewOnly ? 'viewOnly' : 'regular';
      host.accounts[0].isViewOnly = isViewOnly;
      if (!hasStakingOffers) delete host.stakingOffers;
      else {
        Object.assign(host.stakingOffers![0].asset, {
          priceUsd: '3',
          percentChange24h: '1.5',
        });
      }
      session.update(host);

      const { capabilities, walletContext } = session.buildContext();
      expect(capabilities.supportedActions.includes('stake')).toBe(expected);
      expect(walletContext.mode).toBe('wallet');
      if (walletContext.mode !== 'wallet') throw new Error('Expected wallet context');
      expect(walletContext.activeAccount.supportedActions.includes('stake')).toBe(expected);
      expect(walletContext.activeAccount.stakingOffers).toEqual(expected ? [{
        productId: 'liquid',
        asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', decimals: 9 },
      }] : undefined);
    },
  );

  it('advertises a disabled product only for informational yield reads', () => {
    const session = new AgentV2WalletSession();
    const host = hostContext();
    host.stakingOffers![0].availability = 'disabled';
    session.update(host);
    session.updateFeatureCapabilities('disabled', 'disabled', 'available');

    const { capabilities, walletContext } = session.buildContext();
    expect(capabilities.supportedActions).not.toContain('stake');
    expect(walletContext.mode).toBe('wallet');
    if (walletContext.mode !== 'wallet') throw new Error('Expected wallet context');
    expect(walletContext.activeAccount.stakingOffers).toBeUndefined();
    expect(walletContext.activeAccount.stakingYieldOffers).toEqual([{
      productId: 'liquid',
      asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', decimals: 9 },
    }]);
  });

  it.each([
    ['eligible Classic mainnet wallet', 'classic', false, 'regular', false, 2, true],
    ['eligible iOS mainnet wallet', 'ios', false, 'regular', false, 2, true],
    ['unsupported Android client', 'android', false, 'regular', false, 2, false],
    ['testnet wallet', 'classic', true, 'regular', false, 2, false],
    ['Ledger wallet', 'classic', false, 'ledger', false, 2, false],
    ['view-only wallet', 'classic', false, 'viewOnly', true, 2, false],
    ['incomplete local catalog', 'classic', false, 'regular', false, 1, false],
  ] as const)(
    'advertises Swap preparation only for an %s',
    (_name, platform, isTestnet, accountType, isViewOnly, catalogSize, expected) => {
      const session = new AgentV2WalletSession();
      const host = hostContext();
      host.platform = platform;
      host.client = platform === 'classic' ? 'web' : 'native';
      host.isTestnet = isTestnet;
      host.accounts[0].accountType = accountType;
      host.accounts[0].isViewOnly = isViewOnly;
      host.swapAssetCatalog = swapAssetCatalog().slice(0, catalogSize);
      session.update(host);

      const { capabilities, walletContext } = session.buildContext();
      expect(capabilities.supportedTools.some(({ name }) => name === 'action.swap.prepare')).toBe(expected);
      expect(capabilities.supportedActions.includes('swap')).toBe(expected);
      expect(walletContext.mode).toBe('wallet');
      if (walletContext.mode !== 'wallet') throw new Error('Expected wallet context');
      expect(walletContext.activeAccount.supportedActions.includes('swap')).toBe(expected);
    },
  );

  it.each([
    ['classic', 'web', [
      'receive', 'hideSpamAssets', 'openUrl', 'openToken', 'openTransaction', 'openAgent',
    ], ['receive'], true],
    ['ios', 'native', [
      'receive', 'hideSpamAssets', 'openUrl', 'openToken', 'openTransaction', 'openAgent',
    ], ['receive'], true],
    ['android', 'native', ['receive'], ['receive'], false],
  ] as const)(
    'keeps eligible reads but withdraws Send capabilities for a view-only wallet on %s',
    (platform, client, supportedActions, walletSupportedActions, isWalletQuerySupported) => {
      const session = new AgentV2WalletSession();
      const host = hostContext();
      host.platform = platform;
      host.client = client;
      host.accounts[0].accountType = 'viewOnly';
      host.accounts[0].isViewOnly = true;
      session.update(host);
      enableWalletQuery(session);

      const { capabilities, walletContext } = session.buildContext();

      expect(capabilities.supportedTools.some(({ name }) => name === 'wallet.data.query'))
        .toBe(isWalletQuerySupported);
      expect(capabilities.supportedTools).not.toContainEqual(expect.objectContaining({
        name: 'action.send.prepare',
      }));
      expect(capabilities.supportedActions).toEqual(supportedActions);
      expect(capabilities.receiveActionVersion).toBe(3);
      expect(walletContext.mode).toBe('wallet');
      if (walletContext.mode !== 'wallet') throw new Error('Expected wallet context');
      expect(walletContext.activeAccount.supportedActions).toEqual(walletSupportedActions);
    },
  );

  it('withdraws wallet capabilities when the active account is not active', () => {
    const session = new AgentV2WalletSession();
    const host = hostContext();
    host.accounts[0].state = 'deleted';
    session.update(host);

    const { capabilities, walletContext } = session.buildContext();

    expect(capabilities.supportedTools).toEqual([]);
    expect(capabilities.supportedActions).toEqual([
      'openUrl', 'openToken', 'openTransaction', 'openAgent',
    ]);
    expect(capabilities).not.toHaveProperty('receiveActionVersion');
    expect(walletContext.mode).toBe('wallet');
    if (walletContext.mode !== 'wallet') throw new Error('Expected wallet context');
    expect(walletContext.activeAccount).toMatchObject({ state: 'deleted', supportedActions: [] });
  });

  it('increments authority revision only when wallet authority changes', () => {
    const session = new AgentV2WalletSession();
    const host = hostContext();
    expect(session.update(host)).toMatchObject({
      hasAuthorityChanged: true,
      hasWalletContextChanged: true,
    });
    const revision = session.snapshot().revision;
    expect(session.update({ ...host, lang: 'ru' })).toEqual({
      hasAuthorityChanged: false,
      hasWalletContextChanged: false,
      hasActionPolicyChanged: false,
    });
    expect(session.snapshot().revision).toBe(revision);
    expect(session.update({
      ...host,
      accounts: [{
        ...host.accounts[0],
        holdings: [{
          ...host.accounts[0].holdings[0],
          balance: '20',
        }],
      }],
    })).toEqual({
      hasAuthorityChanged: false,
      hasWalletContextChanged: false,
      hasActionPolicyChanged: false,
    });
    expect(session.snapshot().revision).toBe(revision);
    expect(session.update({ ...host, activeNetwork: 'tron' })).toMatchObject({
      hasAuthorityChanged: true,
      hasWalletContextChanged: true,
    });
    expect(session.snapshot().revision).toBe(revision + 1);
  });

  it('tracks swap identity changes without changing wallet authority', () => {
    const session = new AgentV2WalletSession();
    const host = hostContext();
    host.isTestnet = false;
    host.swapAssetCatalog = swapAssetCatalog();
    session.update(host);
    const revision = session.snapshot().revision;

    const refreshedPrices = {
      ...host,
      swapAssetCatalog: host.swapAssetCatalog.map((asset, index) => (
        index === 0 ? { ...asset, priceUsd: '4' } : asset
      )),
    };
    expect(session.update(refreshedPrices)).toEqual({
      hasAuthorityChanged: false,
      hasWalletContextChanged: false,
      hasActionPolicyChanged: false,
    });
    expect(session.snapshot().revision).toBe(revision);
    expect(session.update({
      ...refreshedPrices,
      swapAssetCatalog: refreshedPrices.swapAssetCatalog.map((asset, index) => (
        index === 0 ? { ...asset, decimals: 8 } : asset
      )),
    })).toEqual({
      hasAuthorityChanged: false,
      hasWalletContextChanged: false,
      hasActionPolicyChanged: true,
    });
    expect(session.snapshot().revision).toBe(revision);
    expect(session.update({ ...host, isTestnet: true })).toMatchObject({
      hasAuthorityChanged: true,
      hasWalletContextChanged: true,
    });
    expect(session.snapshot().revision).toBe(revision + 1);
  });

  it('tracks staking policy changes without changing wallet authority', () => {
    const session = new AgentV2WalletSession();
    const host = hostContext();
    session.update(host);
    const revision = session.snapshot().revision;

    expect(session.update({
      ...host,
      stakingOffers: [{ ...host.stakingOffers![0], annualYield: '15' }],
    })).toEqual({
      hasAuthorityChanged: false,
      hasWalletContextChanged: false,
      hasActionPolicyChanged: true,
    });
    expect(session.snapshot().revision).toBe(revision);
  });

  it('distinguishes account access changes from profile changes', () => {
    const session = new AgentV2WalletSession();
    const host = hostContext();
    const secondary = {
      ...host.accounts[0],
      accountId: 'secondary-account',
      label: 'Savings',
      addresses: { ton: 'EQ-secondary-address' },
    };
    session.update({ ...host, accounts: [...host.accounts, secondary] });
    const initialRevision = session.snapshot().revision;

    expect(session.update({ ...host, accounts: host.accounts })).toMatchObject({
      hasAuthorityChanged: true,
      hasWalletContextChanged: true,
    });
    expect(session.snapshot().revision).toBe(initialRevision + 1);

    session.update({ ...host, accounts: [...host.accounts, secondary] });
    const restoredRevision = session.snapshot().revision;
    expect(session.update({
      ...host,
      accounts: [...host.accounts, {
        ...secondary,
        label: 'Cold Savings',
        savedAddresses: [{
          id: 'treasury', name: 'Treasury', chain: 'ton', address: 'EQ-private-treasury',
        }],
      }],
    })).toMatchObject({
      hasAuthorityChanged: false,
      hasWalletContextChanged: true,
    });
    expect(session.snapshot().revision).toBe(restoredRevision + 1);
  });

  it('converges authority binding when a secondary account changes during hashing', async () => {
    const session = new AgentV2WalletSession();
    const host = hostContext();
    host.accounts.push({
      ...host.accounts[0],
      accountId: 'secondary-account',
      label: 'Savings',
      addresses: { ton: 'EQ-secondary-address' },
    });
    session.update(host);

    const bindingDuringUpdate = session.walletAuthorityBinding();
    session.update({ ...host, accounts: host.accounts.slice(0, 1) });

    await expect(bindingDuringUpdate).resolves.toEqual(await session.walletAuthorityBinding());
  });

  it('binds account eligibility and saved-contact profile changes', async () => {
    const session = new AgentV2WalletSession();
    const host = hostContext();
    session.update(host);
    const initial = await session.walletAuthorityBinding();

    session.update({
      ...host,
      accounts: [{
        ...host.accounts[0],
        isViewOnly: true,
        label: 'Renamed',
        savedAddresses: [{
          id: 'treasury', name: 'Treasury', chain: 'ton', address: 'EQ-private-treasury',
        }],
      }],
    });
    const changed = await session.walletAuthorityBinding();

    expect(changed.accountDigest).not.toBe(initial.accountDigest);
    expect(changed.profileDigest).not.toBe(initial.profileDigest);
  });

  it('rotates a legacy persisted wallet session without deleting identity or consent records', async () => {
    sessionStorage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify({
      version: 1,
      sessionId: LEGACY_SESSION_ID,
      revision: 9,
      authorityFingerprint: 'legacy-authority',
    }));
    sessionStorage.setItem('agentV2Consent', 'preserve-consent');
    sessionStorage.setItem('agentV2DeviceIdentity', 'preserve-device');

    const session = await createAgentV2WalletSession();
    const persisted = JSON.parse(sessionStorage.getItem(WALLET_SESSION_STORAGE_KEY)!) as {
      version: number;
      sessionId: string;
      revision: number;
      authorityFingerprint: string;
    };

    expect(session.snapshot()).toMatchObject({ sessionId: persisted.sessionId, revision: 0 });
    expect(persisted).toMatchObject({ version: 2, revision: 0, authorityFingerprint: 'none' });
    expect(persisted.sessionId).not.toBe(LEGACY_SESSION_ID);
    expect(sessionStorage.getItem('agentV2Consent')).toBe('preserve-consent');
    expect(sessionStorage.getItem('agentV2DeviceIdentity')).toBe('preserve-device');
  });

  it('restores a valid current wallet-session record', async () => {
    sessionStorage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify({
      version: 2,
      sessionId: CURRENT_SESSION_ID,
      revision: 4,
      authorityFingerprint: 'current-authority',
    }));

    const session = await createAgentV2WalletSession();

    expect(session.snapshot()).toMatchObject({ sessionId: CURRENT_SESSION_ID, revision: 4 });
    expect(JSON.parse(sessionStorage.getItem(WALLET_SESSION_STORAGE_KEY)!)).toEqual({
      version: 2,
      sessionId: CURRENT_SESSION_ID,
      revision: 4,
      authorityFingerprint: 'current-authority',
    });
  });

  it('resets only wallet protocol session state', async () => {
    const session = await createAgentV2WalletSession();
    const previousSessionId = session.snapshot().sessionId;
    sessionStorage.setItem('agentV2Consent', 'preserve-consent');
    sessionStorage.setItem('agentV2DeviceIdentity', 'preserve-device');

    await session.reset();

    expect(session.snapshot()).toMatchObject({ revision: 0 });
    expect(session.snapshot().sessionId).not.toBe(previousSessionId);
    expect(sessionStorage.getItem(WALLET_SESSION_STORAGE_KEY)).not.toBeNull();
    expect(sessionStorage.getItem('agentV2Consent')).toBe('preserve-consent');
    expect(sessionStorage.getItem('agentV2DeviceIdentity')).toBe('preserve-device');
  });

  it('serializes session writes and waits for the latest state to persist', async () => {
    const firstWrite = createDeferred<void>();
    const persistedValues: Array<{ revision: number }> = [];
    const persistence: AgentV2SessionStorage = {
      getItem: () => Promise.resolve(sessionStorage.getItem('missing-agent-v2-session')),
      setItem: jest.fn((_key, value) => {
        persistedValues.push(JSON.parse(value) as { revision: number });
        return persistedValues.length === 1 ? firstWrite.promise : Promise.resolve();
      }),
      removeItem: jest.fn(() => Promise.resolve()),
    };
    const session = new AgentV2WalletSession({
      persistence,
      randomUuid: () => CURRENT_SESSION_ID,
    });

    session.update(hostContext());
    session.update({ ...hostContext(), activeNetwork: 'tron' });
    const flush = session.flushPersistence();
    await Promise.resolve();

    expect(persistedValues.map(({ revision }) => revision)).toEqual([0]);
    firstWrite.resolve();
    await flush;
    expect(persistedValues.map(({ revision }) => revision)).toEqual([0, 1, 2]);
  });

  it('keeps a fresh session usable when persistence is unavailable', async () => {
    const persistence: AgentV2SessionStorage = {
      getItem: jest.fn(() => Promise.reject(new Error('Session storage is unavailable'))),
      setItem: jest.fn(() => Promise.reject(new Error('Session storage is unavailable'))),
      removeItem: jest.fn(() => Promise.reject(new Error('Session storage is unavailable'))),
    };

    const session = await createAgentV2WalletSession({
      persistence,
      randomUuid: () => CURRENT_SESSION_ID,
    });
    session.update(hostContext());

    expect(session.snapshot()).toMatchObject({ sessionId: CURRENT_SESSION_ID, revision: 1 });
    expect(persistence.setItem).not.toHaveBeenCalled();
  });

  it('removes the persisted wallet session during a full reset', async () => {
    const persistence: AgentV2SessionStorage = {
      getItem: jest.fn(() => Promise.resolve(JSON.stringify({
        version: 2,
        sessionId: CURRENT_SESSION_ID,
        revision: 4,
        authorityFingerprint: 'current-authority',
      }))),
      setItem: jest.fn(() => Promise.resolve()),
      removeItem: jest.fn(() => Promise.resolve()),
    };
    const session = await createAgentV2WalletSession({ persistence });

    await session.reset({ shouldClearPersistentState: true });

    expect(persistence.removeItem).toHaveBeenCalledWith(WALLET_SESSION_STORAGE_KEY);
  });

  it('indexes account-bound contact and address references', () => {
    const session = new AgentV2WalletSession();
    const host = hostContext();
    host.accounts[0].savedAddresses = [{
      id: 'treasury', name: 'Treasury', chain: 'ton', address: 'EQ-private-treasury',
    }];

    session.update(host);

    const refs = session.resolveSavedAddressRefs('account-id', 'treasury');
    expect(refs).toEqual({
      contactRef: expect.stringMatching(/^contact_/u),
      addressRef: expect.stringMatching(/^address_/u),
    });
    expect(session.snapshot().addresses.get(refs!.addressRef)).toBe('EQ-private-treasury');
  });

  it('indexes opaque recipient references for own wallet addresses', () => {
    const session = new AgentV2WalletSession();
    session.update(hostContext());

    const refs = session.resolveWalletAddressRefs('account-id', 'ton');

    expect(refs).toEqual({
      contactRef: expect.stringMatching(/^contact_/u),
      addressRef: expect.stringMatching(/^address_/u),
    });
    expect(session.snapshot().addresses.get(refs!.addressRef)).toBe('EQ-public-address');
  });

  it.each(['classic', 'ios'] as const)(
    'retains fetched portfolio history across reordered wallet keys on %s',
    (platform) => {
      const session = new AgentV2WalletSession();
      const initialHost = { ...hostContext(), platform };
      initialHost.accounts[0].portfolioWalletKeys = ['ton:EQ-main', 'tron:T-main'];
      session.update(initialHost);
      session.rememberPortfolioHistory({
        accountId: 'account-id',
        baseCurrency: 'USD',
        range: '3M',
        fetchedAtSlot: 123,
        netWorth: {
          status: 'ok',
          base: 'USD',
          density: '1d',
          points: [[1, 10], [2, 12]],
        },
      });

      const refreshedHost = { ...hostContext(), platform };
      refreshedHost.accounts[0].portfolioWalletKeys = ['tron:T-main', 'ton:EQ-main'];
      session.update(refreshedHost);

      expect(session.snapshot().host?.portfolioHistory?.['3m']).toEqual({
        fetchedAtSlot: 123,
        response: expect.objectContaining({ base: 'USD', points: [[1, 10], [2, 12]] }),
      });
    },
  );

  it('drops fetched portfolio history when the active wallet keys change', () => {
    const session = new AgentV2WalletSession();
    const initialHost = hostContext();
    initialHost.accounts[0].portfolioWalletKeys = ['ton:EQ-main'];
    session.update(initialHost);
    session.rememberPortfolioHistory({
      accountId: 'account-id',
      baseCurrency: 'USD',
      range: '1D',
      fetchedAtSlot: 123,
      netWorth: { status: 'ok', base: 'USD', density: '1h', points: [[1, 10]] },
    });

    const refreshedHost = hostContext();
    refreshedHost.accounts[0].portfolioWalletKeys = ['ton:EQ-main', 'tron:T-main'];
    refreshedHost.portfolioHistory = {
      '1d': {
        fetchedAtSlot: 123,
        response: { status: 'ok', base: 'USD', density: '1h', points: [[1, 10]] },
      },
    };
    session.update(refreshedHost);

    expect(session.snapshot().host?.portfolioHistory).toBeUndefined();
  });

  it('does not carry portfolio history across account or base-currency authority changes', () => {
    const session = new AgentV2WalletSession();
    session.update(hostContext());
    session.rememberPortfolioHistory({
      accountId: 'account-id',
      baseCurrency: 'USD',
      range: '1D',
      fetchedAtSlot: 123,
      netWorth: { status: 'ok', base: 'USD', density: '1h', points: [[1, 10]] },
    });

    session.update({ ...hostContext(), baseCurrency: 'EUR' });

    expect(session.snapshot().host?.portfolioHistory).toBeUndefined();
  });
});

function enableWalletQuery(session: AgentV2WalletSession) {
  session.updateFeatureCapabilities('available', 'available');
  session.updateWalletQueryCapabilities({
    status: 'available',
    supportedToolVersions: [5],
    filterCatalog: {
      version: 1,
      digest: contractManifest.walletFilterCatalogSha256,
      requiresClientTimeZone: true,
    },
  });
}

function hostContext(): AgentV2HostContextSnapshot {
  return {
    platform: 'classic',
    client: 'web',
    lang: 'en',
    baseCurrency: 'USD',
    currencyRate: '1',
    activeAccountId: 'account-id',
    activeNetwork: 'ton',
    isTestnet: false,
    assetCatalog: [{
      slug: 'toncoin',
      chain: 'ton',
      symbol: 'TON',
      decimals: 9,
      priceUsd: '3',
      percentChange24h: '1.5',
    }],
    stakingOffers: [{
      productId: 'liquid',
      asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', decimals: 9 },
      annualYield: '14.09',
      yieldType: 'APY',
      availability: 'available',
    }],
    accounts: [{
      accountId: 'account-id',
      label: 'Main',
      state: 'active',
      accountType: 'regular',
      isViewOnly: false,
      chains: ['ton', 'tron'],
      addresses: { ton: 'EQ-public-address', tron: 'T-public-address' },
      holdings: [{
        asset: { slug: 'toncoin', chain: 'ton', symbol: 'TON', decimals: 9 },
        balance: '10',
      }],
    }],
    savedAddresses: [],
  };
}

function swapAssetCatalog(): NonNullable<AgentV2HostContextSnapshot['swapAssetCatalog']> {
  return [
    { slug: 'toncoin', chain: 'ton', symbol: 'TON', name: 'Toncoin', decimals: 9, priceUsd: '3' },
    { slug: 'usdton', chain: 'ton', symbol: 'USDT', name: 'Tether USD', decimals: 6, priceUsd: '1' },
  ];
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
