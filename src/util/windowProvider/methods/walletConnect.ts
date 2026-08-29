export function openWalletConnectUrl(_url: string): Promise<boolean> {
  return Promise.reject(new Error('Opening a WalletConnect URL is not available in this build'));
}
