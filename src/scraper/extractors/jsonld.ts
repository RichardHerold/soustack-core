import { load } from 'cheerio';
import type { SchemaOrgRecipe } from '../types';
import { isRecipeNode, safeJsonParse } from './utils';

type JsonLdPayload = Record<string, unknown> | Array<Record<string, unknown>>;

export function extractJsonLd(html: string): SchemaOrgRecipe | null {
  const $ = load(html);
  const scripts = $('script[type="application/ld+json"]');
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/7225c3b5-9ac2-4c94-b561-807ca9003b66',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scraper/extractors/jsonld.ts:8',message:'JSON-LD scripts found',data:{scriptCount:scripts.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,D'})}).catch(()=>{});
  // #endregion
  const candidates: SchemaOrgRecipe[] = [];

  scripts.each((_, element) => {
    const content = $(element).html();
    if (!content) return;

    const parsed = safeJsonParse<JsonLdPayload>(content);
    if (!parsed) return;
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/7225c3b5-9ac2-4c94-b561-807ca9003b66',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scraper/extractors/jsonld.ts:18',message:'JSON-LD parsed',data:{hasGraph:!!(parsed&&typeof parsed==='object'&&'@graph' in parsed),type:(parsed&&typeof parsed==='object'&&'@type' in parsed)?(parsed as any)['@type']:undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C'})}).catch(()=>{});
    // #endregion

    collectCandidates(parsed, candidates);
  });
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/7225c3b5-9ac2-4c94-b561-807ca9003b66',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scraper/extractors/jsonld.ts:22',message:'JSON-LD candidates',data:{candidateCount:candidates.length,candidateTypes:candidates.map(c=>c['@type'])},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C'})}).catch(()=>{});
  // #endregion

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
