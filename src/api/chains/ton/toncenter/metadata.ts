import type { AnyTokenMetadata, MetadataMap } from './types';

export function extractMetadata<T extends AnyTokenMetadata>(
  rawAddress: string,
  metadata: MetadataMap,
  type: AnyTokenMetadata['type'],
): T | undefined {
  const data = metadata[rawAddress];
  if (!data || !data.is_indexed) return undefined;
  return data.token_info?.find((tokenInfo) => tokenInfo.type === type) as T;
}

/**
 * The image served by the Toncenter image proxy. Loading the original image URL instead would expose the user's IP
 * address to the host chosen by the token issuer.
 */
export function getProxiedImage(metadata?: AnyTokenMetadata) {
  return metadata?.extra?._image_medium ?? metadata?.extra?._image_small;
}
