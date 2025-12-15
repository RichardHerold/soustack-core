import { SchemaOrgImage } from '../types/schemaOrg';

/**
 * Normalize Schema.org image formats to Soustack format.
 * - String values pass through
 * - Arrays collapse to string or string[] after URL extraction
 * - ImageObjects extract their url/contentUrl
 */
export function normalizeImage(
  image: SchemaOrgImage | undefined | null
): string | string[] | undefined {
  if (!image) {
    return undefined;
  }

  if (typeof image === 'string') {
    const trimmed = image.trim();
    return trimmed || undefined;
  }

  if (Array.isArray(image)) {
    const urls = image
      .map(entry => (typeof entry === 'string' ? entry.trim() : extractUrl(entry)))
      .filter((url): url is string => typeof url === 'string' && Boolean(url));

    if (urls.length === 0) {
      return undefined;
    }
    if (urls.length === 1) {
      return urls[0];
    }
    return urls;
  }

  return extractUrl(image);
}

function extractUrl(
  value: Exclude<SchemaOrgImage, string | string[] | undefined | null>
): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as { url?: unknown; contentUrl?: unknown };
  const candidate =
    typeof record.url === 'string'
      ? record.url
      : typeof record.contentUrl === 'string'
        ? record.contentUrl
        : undefined;

  if (!candidate) {
    return undefined;
  }

  const trimmed = candidate.trim();
  return trimmed || undefined;
}
