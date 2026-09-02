// Guards the two build axes:
//   - brand axis, driven by IS_GRAM_WALLET: it decides the app/extension names, outbound links and deeplinks
//   - identity/storage axis, folded into the same flag: Gram Wallet Web serves the existing wallet.ton.org
//     population, so it must keep resolving that site's domain and the storage keys the users' state is saved under
// Config reads the flags from process.env at module-eval time, so every flavor gets a clean env + an isolated
// re-import.

type Flavor = 'default' | 'gram';

const FLAVORS: Flavor[] = ['default', 'gram'];

// Only these env vars feed the constants under test; reset them all, then set the profile's subset.
const AXIS_FLAGS = ['IS_GRAM_WALLET', 'IS_EXPLORER', 'APP_NAME'] as const;

const FLAVOR_ENV: Record<Flavor, Partial<Record<'IS_GRAM_WALLET', '1'>>> = {
  default: {},
  gram: { IS_GRAM_WALLET: '1' },
};

type ConfigModule = typeof import('./config');
type DeeplinkModule = typeof import('./util/deeplink/constants');
type ChainModule = typeof import('./util/chain');
type TokensModule = typeof import('./util/tokens');

const savedEnv: Partial<Record<(typeof AXIS_FLAGS)[number], string | undefined>> = {};

beforeAll(() => {
  for (const key of AXIS_FLAGS) {
    savedEnv[key] = process.env[key];
  }
});

afterAll(() => {
  for (const key of AXIS_FLAGS) {
    const previous = savedEnv[key];
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
});

async function withFlavor(
  flavor: Flavor,
  run: (config: ConfigModule, deeplink: DeeplinkModule, chain: ChainModule, tokens: TokensModule) => void,
) {
  for (const key of AXIS_FLAGS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(FLAVOR_ENV[flavor])) {
    process.env[key] = value;
  }

  await jest.isolateModulesAsync(async () => {
    // All modules resolve inside the same fresh registry, so they see the same config instance.
    const config = await import('./config');
    const deeplink = await import('./util/deeplink/constants');
    const chain = await import('./util/chain');
    const tokens = await import('./util/tokens');
    run(config, deeplink, chain, tokens);
  });
}

// Brand + identity/storage constants.
const CONFIG_EXPECTATIONS: Record<Flavor, Record<string, string | boolean>> = {
  default: {
    APP_NAME: 'My Wallet',
    EXTENSION_NAME: 'My Wallet • Crypto & Web3',
    GLOBAL_STATE_CACHE_KEY: 'mytonwallet-global-state',
    ACTIVE_TAB_STORAGE_KEY: 'mtw-active-tab',
    TONCONNECT_WALLET_JSBRIDGE_KEY: 'mytonwallet',
    PRODUCTION_URL: 'https://web.mywallet.io',
    BETA_URL: 'https://beta.mywallet.io',
    APP_INSTALL_URL: 'https://get.mywallet.io/',
    APP_WEBSITE_URL: 'https://mywallet.io',
    APP_PROMO_URL: 'https://mywallet.io/',
    APP_TERMS_OF_USE_URL: 'https://mywallet.io/terms-of-use',
    APP_PRIVACY_POLICY_URL: 'https://mywallet.io/privacy-policy',
    WINDOW_PROVIDER_PORT: 'MyWallet_popup_reversed',
  },
  // The Gram flavor carries the wallet.ton.org identity/storage: web, the store extension and the Air SDK.
  gram: {
    APP_NAME: 'Gram Wallet',
    EXTENSION_NAME: 'Gram Wallet',
    GLOBAL_STATE_CACHE_KEY: 'tonwallet-global-state',
    ACTIVE_TAB_STORAGE_KEY: 'tw-active-tab',
    TONCONNECT_WALLET_JSBRIDGE_KEY: 'gramwallet',
    PRODUCTION_URL: 'https://wallet.ton.org',
    BETA_URL: 'https://beta.wallet.ton.org',
    APP_INSTALL_URL: 'https://get.gramwallet.io/',
    APP_WEBSITE_URL: 'https://gramwallet.io',
    APP_PROMO_URL: 'https://gramwallet.io/',
    APP_TERMS_OF_USE_URL: 'https://gramwallet.io/terms-of-use/',
    APP_PRIVACY_POLICY_URL: 'https://gramwallet.io/privacy-policy/',
    WINDOW_PROVIDER_PORT: 'GramWallet_popup_reversed',
  },
};

const DEEPLINK_EXPECTATIONS: Record<Flavor, {
  SELF_PROTOCOL: string;
  TONCONNECT_UNIVERSAL_URL: string;
  SELF_UNIVERSAL_URLS: string[];
}> = {
  default: {
    SELF_PROTOCOL: 'mtw://',
    TONCONNECT_UNIVERSAL_URL: 'https://connect.mytonwallet.org',
    SELF_UNIVERSAL_URLS: ['https://my.tt', 'https://go.mytonwallet.org'],
  },
  gram: {
    SELF_PROTOCOL: 'gramwallet://',
    TONCONNECT_UNIVERSAL_URL: 'https://connect.gramwallet.io',
    SELF_UNIVERSAL_URLS: ['https://go.gramwallet.io'],
  },
};

describe.each(FLAVORS)('build flavor: %s', (flavor) => {
  it('resolves brand/identity config constants', async () => {
    await withFlavor(flavor, (config) => {
      const expected = CONFIG_EXPECTATIONS[flavor];
      const actual: Record<string, string | boolean> = {
        APP_NAME: config.APP_NAME,
        EXTENSION_NAME: config.EXTENSION_NAME,
        GLOBAL_STATE_CACHE_KEY: config.GLOBAL_STATE_CACHE_KEY,
        ACTIVE_TAB_STORAGE_KEY: config.ACTIVE_TAB_STORAGE_KEY,
        TONCONNECT_WALLET_JSBRIDGE_KEY: config.TONCONNECT_WALLET_JSBRIDGE_KEY,
        PRODUCTION_URL: config.PRODUCTION_URL,
        BETA_URL: config.BETA_URL,
        APP_INSTALL_URL: config.APP_INSTALL_URL,
        APP_WEBSITE_URL: config.APP_WEBSITE_URL,
        APP_PROMO_URL: config.APP_PROMO_URL,
        APP_TERMS_OF_USE_URL: config.APP_TERMS_OF_USE_URL,
        APP_PRIVACY_POLICY_URL: config.APP_PRIVACY_POLICY_URL,
        WINDOW_PROVIDER_PORT: config.WINDOW_PROVIDER_PORT,
      };
      // Compare the whole object so a single failing run lists every mismatched axis at once.
      expect(actual).toEqual(expected);
    });
  });

  it('resolves brand-axis deeplink constants', async () => {
    await withFlavor(flavor, (_config, deeplink) => {
      const expected = DEEPLINK_EXPECTATIONS[flavor];
      expect(deeplink.SELF_PROTOCOL).toBe(expected.SELF_PROTOCOL);
      expect(deeplink.TONCONNECT_UNIVERSAL_URL).toBe(expected.TONCONNECT_UNIVERSAL_URL);
      expect(deeplink.SELF_UNIVERSAL_URLS).toEqual(expected.SELF_UNIVERSAL_URLS);
    });
  });
});

describe('getDefaultEnabledSlugs resolves per brand axis', () => {
  // Chains of the default-enabled token set per flavor. This is what puts zero-balance rows on an empty wallet's
  // home screen. It stays TON-only for gram: legacy wallet.ton.org accounts hold TON-native mnemonics that cannot
  // derive foreign addresses, so those rows would be dead. Air does the same.
  const chainsByFlavor: Partial<Record<Flavor, Set<string>>> = {};

  beforeAll(async () => {
    for (const flavor of FLAVORS) {
      await withFlavor(flavor, (_config, _deeplink, chain, tokens) => {
        const slugs = [...chain.getDefaultEnabledSlugs('mainnet')];
        expect(slugs.length).toBeGreaterThan(0);
        chainsByFlavor[flavor] = new Set(slugs.map((slug) => tokens.getChainBySlug(slug)));
      });
    }
  });

  it('gram defaults to TON tokens only', () => {
    expect([...chainsByFlavor.gram!]).toEqual(['ton']);
  });

  it('default keeps the multichain defaults', () => {
    expect(chainsByFlavor.default!.size).toBeGreaterThan(1);
  });
});

describe('brand axis is exclusive', () => {
  it('no outbound link points at another brand', async () => {
    await withFlavor('gram', (config) => {
      for (const url of [config.APP_PROMO_URL, config.APP_TERMS_OF_USE_URL, config.APP_PRIVACY_POLICY_URL,
        config.APP_WEBSITE_URL, config.APP_INSTALL_URL]) {
        expect(url).toContain('gramwallet.io');
      }
    });
  });
});
