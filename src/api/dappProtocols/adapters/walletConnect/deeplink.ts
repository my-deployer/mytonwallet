export type WalletConnectDeeplink = {
  topic: string;
  requestKey: string;
  shouldPair: boolean;
  isLinkModeRequest: boolean;
  message?: string;
};

export function getWalletConnectRequestKey(deeplink: WalletConnectDeeplink, sessionExists: boolean) {
  return deeplink.isLinkModeRequest && !sessionExists ? `pairing:${deeplink.topic}` : deeplink.requestKey;
}

export function parseWalletConnectDeeplink(url: string): WalletConnectDeeplink | undefined {
  let uri = url;
  let params: URLSearchParams | undefined;
  if (!url.startsWith('wc:')) {
    try {
      params = new URL(url).searchParams;
      uri = params.get('uri') || '';
    } catch {
      return undefined;
    }
  }

  const sessionTopic = params?.get('sessionTopic') ?? params?.get('topic');
  const requestId = params?.get('requestId');
  const message = params?.get('wc_ev') ?? params?.get('message') ?? undefined;
  if (sessionTopic && (requestId || message)) {
    return {
      topic: sessionTopic,
      requestKey: requestId ? `session:${sessionTopic}:${requestId}` : `session:${sessionTopic}`,
      shouldPair: false,
      isLinkModeRequest: Boolean(message),
      message,
    };
  }

  const match = uri.match(/^wc:([^@?]+)@2/i);
  if (!match) return undefined;

  const topic = match[1];
  const shouldPair = new URLSearchParams(uri.split('?')[1]).has('symKey');
  return {
    topic,
    requestKey: `${shouldPair ? 'pairing' : 'session'}:${topic}`,
    shouldPair,
    isLinkModeRequest: false,
  };
}
