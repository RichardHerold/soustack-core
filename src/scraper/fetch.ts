import type { FetchImplementation, FetchOptions, FetchRequestInit } from './types';

const DEFAULT_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];

function chooseUserAgent(provided?: string): string {
  if (provided) return provided;
  const index = Math.floor(Math.random() * DEFAULT_USER_AGENTS.length);
  return DEFAULT_USER_AGENTS[index];
}

function resolveFetch(fetchFn?: FetchImplementation): FetchImplementation {
  if (fetchFn) {
    return fetchFn;
  }

  const globalFetch = (globalThis as { fetch?: FetchImplementation }).fetch;
  if (!globalFetch) {
    throw new Error(
      'A global fetch implementation is not available. Provide window.fetch in browsers or upgrade to Node 18+.'
    );
  }

  return globalFetch;
}

function isBrowserEnvironment(): boolean {
  return typeof (globalThis as { document?: unknown }).document !== 'undefined';
}

function isClientError(error: Error & { status?: number }): boolean {
  if (typeof error.status === 'number') {
    return error.status >= 400 && error.status < 500;
  }
  return error.message.includes('HTTP 4');
}

async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchPage(url: string, options: FetchOptions = {}): Promise<string> {
  const {
    timeout = 10_000,
    userAgent,
    maxRetries = 2,
    fetchFn
  } = options;

  let lastError: Error | null = null;
  const resolvedFetch = resolveFetch(fetchFn);
  const isBrowser = isBrowserEnvironment();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      };

      if (!isBrowser) {
        headers['User-Agent'] = chooseUserAgent(userAgent);
      }

      const requestInit: FetchRequestInit = {
        headers,
        signal: controller.signal,
        redirect: 'follow'
      };

      const response = await resolvedFetch(url, requestInit);

      clearTimeout(timeoutId);
      if (response && typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
        const ingestUrl = process.env.SOUSTACK_DEBUG_INGEST_URL;
        if (ingestUrl) {
          try {
            const globalFetch = typeof globalThis !== 'undefined' && typeof globalThis.fetch !== 'undefined' ? globalThis.fetch : null;
            if (globalFetch) {
              globalFetch(ingestUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scraper/fetch.ts:63',message:'fetch response',data:{url,status:response.status,statusText:response.statusText,ok:response.ok,isNYTimes:url.includes('nytimes.com')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            }
          } catch {}
        }
      }

      if (!response.ok) {
        const error: Error & { status?: number } = new Error(
          `HTTP ${response.status}: ${response.statusText}`
        );
        error.status = response.status;
        throw error;
      }

      const html = await response.text();
      if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
        const ingestUrl = process.env.SOUSTACK_DEBUG_INGEST_URL;
        if (ingestUrl) {
          try {
            const globalFetch = typeof globalThis !== 'undefined' && typeof globalThis.fetch !== 'undefined' ? globalThis.fetch : null;
            if (globalFetch) {
              globalFetch(ingestUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scraper/fetch.ts:75',message:'HTML received',data:{htmlLength:html.length,hasLoginPage:html.toLowerCase().includes('login')||html.toLowerCase().includes('sign in'),hasRecipeData:html.includes('application/ld+json')||html.includes('schema.org/Recipe')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,D'})}).catch(()=>{});
            }
          } catch {}
        }
      }
      return html;
    } catch (err) {
      clearTimeout(timeoutId);

      lastError = err instanceof Error ? err : new Error(String(err));

      if (isClientError(lastError)) {
        throw lastError;
      }

      if (attempt < maxRetries) {
        await wait(1000 * (attempt + 1));
        continue;
      }
    }
  }

  throw lastError ?? new Error('Failed to fetch page');
}

export { FetchOptions };
