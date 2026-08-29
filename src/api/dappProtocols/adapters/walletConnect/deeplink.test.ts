import { getWalletConnectRequestKey, parseWalletConnectDeeplink } from './deeplink';

describe('WalletConnect deeplinks', () => {
  it('parses a Link Mode envelope', () => {
    const deeplink = parseWalletConnectDeeplink(
      'https://connect.mywallet.io/wc?topic=session-topic&wc_ev=envelope%2Fpayload%3D',
    );
    expect(deeplink).toEqual({
      topic: 'session-topic',
      requestKey: 'session:session-topic',
      shouldPair: false,
      isLinkModeRequest: true,
      message: 'envelope/payload=',
    });
    expect(getWalletConnectRequestKey(deeplink!, true)).toBe('session:session-topic');
    expect(getWalletConnectRequestKey(deeplink!, false)).toBe('pairing:session-topic');
  });

  it('parses a pairing URI wrapped in a universal link', () => {
    expect(parseWalletConnectDeeplink(
      'https://connect.mywallet.io/wc?uri=wc%3Apairing-topic%402%3Frelay-protocol%3Dirn%26symKey%3Dsecret',
    )).toEqual({
      topic: 'pairing-topic',
      requestKey: 'pairing:pairing-topic',
      shouldPair: true,
      isLinkModeRequest: false,
    });
  });
});
