import type { ApiUpdateConfig } from '../types';

const mockCallBackendGet = jest.fn();

jest.mock('../../config', () => ({
  ...jest.requireActual('../../config'),
  NO_EXTRA_FEATURES: true,
}));

jest.mock('../chains', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../common/addresses', () => ({
  tryUpdateKnownAddresses: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../common/backend', () => ({
  callBackendGet: (...args: unknown[]) => mockCallBackendGet(...args),
  callBackendPost: jest.fn(),
}));

jest.mock('../common/cache', () => ({
  setBackendConfigCache: jest.fn(),
}));

jest.mock('../common/polling/utils', () => ({
  pollingLoop: () => ({ stop: jest.fn() }),
}));

jest.mock('../common/tokens', () => ({
  fetchNonBackendTokenDetails: jest.fn().mockResolvedValue([]),
  loadTokensCache: jest.fn().mockResolvedValue(undefined),
  pauseTokenUpdates: jest.fn(),
  resumeTokenUpdates: jest.fn(),
  sendUpdateTokens: jest.fn(),
  tokensPreload: { promise: Promise.resolve() },
  updateTokens: jest.fn(),
  updateTokensFromBackend: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../storages', () => ({
  storage: {
    getItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('./preload', () => ({
  resolveDataPreloadPromise: jest.fn(),
}));

describe('backend config polling', () => {
  beforeEach(() => {
    mockCallBackendGet.mockImplementation((path: string) => {
      if (path === '/utils/get-config') {
        return Promise.resolve({
          agentProtocolVersion: 'v2',
          country: 'DE',
          isLimited: false,
          isUpdateRequired: false,
          now: Date.now(),
        });
      }

      if (path === '/currency-rates') {
        return Promise.resolve({ rates: {} });
      }

      return Promise.resolve({});
    });
  });

  afterEach(() => {
    mockCallBackendGet.mockReset();
  });

  it('forwards the agent protocol version from the backend config update', async () => {
    const { destroyPolling, initPolling } = await import('./polling');
    const updatePromise = new Promise<ApiUpdateConfig>((resolve) => {
      initPolling((update) => {
        if (update.type === 'updateConfig') resolve(update);
      });
    });

    await expect(updatePromise).resolves.toMatchObject({
      type: 'updateConfig',
      agentProtocolVersion: 'v2',
    });

    await destroyPolling();
  });

  it('does not forward an unsupported agent protocol version', async () => {
    mockCallBackendGet.mockImplementation((path: string) => {
      if (path === '/utils/get-config') {
        return Promise.resolve({
          agentProtocolVersion: 'v3',
          country: 'DE',
          isLimited: false,
          isUpdateRequired: false,
          now: Date.now(),
        });
      }

      if (path === '/currency-rates') return Promise.resolve({ rates: {} });
      return Promise.resolve({});
    });
    const { destroyPolling, initPolling } = await import('./polling');
    const updatePromise = new Promise<ApiUpdateConfig>((resolve) => {
      initPolling((update) => {
        if (update.type === 'updateConfig') resolve(update);
      });
    });

    await expect(updatePromise).resolves.toMatchObject({
      type: 'updateConfig',
      agentProtocolVersion: undefined,
    });

    await destroyPolling();
  });
});
