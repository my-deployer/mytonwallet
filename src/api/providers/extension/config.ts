import { IS_GRAM_WALLET } from '../../../config';

// Port and channel names are runtime-only, but must differ per brand: with both extensions installed on one page,
// a shared postMessage channel would cross-wire their dApp bridges.
export const POPUP_PORT = IS_GRAM_WALLET ? 'GramWallet_popup' : 'MyWallet_popup';
export const CONTENT_SCRIPT_PORT = IS_GRAM_WALLET ? 'GramWallet_contentScript' : 'MyWallet_contentScript';
export const PAGE_CONNECTOR_CHANNEL = IS_GRAM_WALLET ? 'GramWallet_pageConnector' : 'MyWallet_pageConnector';
