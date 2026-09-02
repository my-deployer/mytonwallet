const mockCallBackendPost = jest.fn();
const mockFetchNftByAddress = jest.fn();

jest.mock('../common/backend', () => ({
  callBackendPost: (...args: unknown[]) => mockCallBackendPost(...args),
}));

jest.mock('../chains/ton/toncenter/nfts', () => ({
  fetchNftByAddress: (...args: unknown[]) => mockFetchNftByAddress(...args),
}));

import { fetchNftByAddress, reportNft } from './nfts';

const NFT_ADDRESS = 'EQBtqQlC09xW_oOHJOrMofDmFndOrY7zCjd7bYELIoabO9JC';

describe('NFT methods', () => {
  afterEach(() => {
    mockCallBackendPost.mockReset();
    mockFetchNftByAddress.mockReset();
  });

  it('sends a chain-qualified NFT report to the backend', async () => {
    mockCallBackendPost.mockResolvedValue({ ok: true });
    const options = {
      chain: 'ton' as const,
      network: 'mainnet' as const,
      nftAddress: 'EQ-reported-nft',
    };

    await reportNft(options);

    expect(mockCallBackendPost).toHaveBeenCalledWith('/nfts/report', options);
  });

  describe('fetchNftByAddress', () => {
    it('serves the NFT loaded by the chain', async () => {
      const parsedNft = { address: NFT_ADDRESS, name: 'Parsed NFT' };
      mockFetchNftByAddress.mockResolvedValue(parsedNft);

      const result = await fetchNftByAddress('ton', 'mainnet', NFT_ADDRESS);

      expect(mockFetchNftByAddress).toHaveBeenCalledWith('mainnet', NFT_ADDRESS);
      expect(result).toBe(parsedNft);
    });
  });
});
