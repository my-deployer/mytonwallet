import type { JettonMasterMetadata } from './types';

import { getProxiedImage } from './metadata';

describe('getProxiedImage', () => {
  it('prefers the medium proxied image', () => {
    const metadata: JettonMasterMetadata = {
      type: 'jetton_masters',
      image: 'https://scam.example/logo.png',
      extra: {
        _image_small: 'https://proxy.toncenter.com/small',
        _image_medium: 'https://proxy.toncenter.com/medium',
        _image_big: 'https://proxy.toncenter.com/big',
      },
    };

    expect(getProxiedImage(metadata)).toBe('https://proxy.toncenter.com/medium');
  });

  it('gives no image instead of the original URL when the proxy has none', () => {
    const metadata: JettonMasterMetadata = {
      type: 'jetton_masters',
      image: 'https://scam.example/logo.png',
    };

    expect(getProxiedImage(metadata)).toBeUndefined();
  });
});
