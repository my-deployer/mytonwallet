import type { LangCode } from '../../global/types';
import type {
  ApiMarketAssetsResponse,
  ApiMarketAssetsResponseWithSlug,
} from '../types';

import { callBackendGet } from '../common/backend';
import { getSwapItemSlug } from '../common/swap';

function enrichMarketResponse(response: ApiMarketAssetsResponse): ApiMarketAssetsResponseWithSlug {
  return {
    sections: response.sections
      .map((section) => ({
        ...section,
        assets: section.assets.map((e) => ({
          ...e,
          slug: getSwapItemSlug(e.newBackendId, e.chain),
        })),
      }))
      .filter((section) => section.assets.length > 0),
  };
}

export async function fetchMarketAssets(langCode?: LangCode): Promise<ApiMarketAssetsResponseWithSlug | undefined> {
  const response = await callBackendGet<ApiMarketAssetsResponse>(
    '/market/assets',
    langCode ? { langCode } : undefined,
  );

  return enrichMarketResponse(response);
}
