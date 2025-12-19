import { load } from 'cheerio';
import type { SchemaOrgRecipe } from '../types';
import { isRecipeNode, safeJsonParse } from './utils';

type JsonLdPayload = Record<string, unknown> | Array<Record<string, unknown>>;

export function extractJsonLd(html: string): SchemaOrgRecipe | null {
  const $ = load(html);
  const scripts = $('script[type="application/ld+json"]');
  const candidates: SchemaOrgRecipe[] = [];

  scripts.each((_, element) => {
    const content = $(element).html();
    if (!content) return;

    const parsed = safeJsonParse<JsonLdPayload>(content);
    if (!parsed) return;

    collectCandidates(parsed, candidates);
  });

  return candidates[0] ?? null;
}

function collectCandidates(payload: unknown, bucket: SchemaOrgRecipe[]) {
  if (!payload) return;

  if (Array.isArray(payload)) {
    payload.forEach(entry => collectCandidates(entry, bucket));
    return;
  }

  if (typeof payload !== 'object') {
    return;
  }

  if (isRecipeNode(payload)) {
    bucket.push(payload);
    return;
  }

  const graph = (payload as Record<string, unknown>)['@graph'];
  if (Array.isArray(graph)) {
    graph.forEach(entry => collectCandidates(entry, bucket));
  }
}
