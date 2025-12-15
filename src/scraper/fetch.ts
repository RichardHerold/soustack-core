import type { RequestInit } from 'node-fetch';
import type { FetchOptions } from './types';

const DEFAULT_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];

type FetchFn = typeof import('node-fetch')['default'];

let fetchImpl: Promise<FetchFn> | null = null;

async function ensureFetch(): Promise<FetchFn> {
  if (!fetchImpl) {
    fetchImpl = import('node-fetch').then(mod => mod.default as FetchFn);
  }
  return fetchImpl;
}

function chooseUserAgent(provided?: string): string {
  if (provided) return provided;
  const index = Math.floor(Math.random() * DEFAULT_USER_AGENTS.length);
  return DEFAULT_USER_AGENTS[index];
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
    maxRetries = 2
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const fetch = await ensureFetch();
      const headers = {
        'User-Agent': chooseUserAgent(userAgent),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      };

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
        redirect: 'follow'
      } as RequestInit);

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error: Error & { status?: number } = new Error(
          `HTTP ${response.status}: ${response.statusText}`
        );
        error.status = response.status;
        throw error;
      }

      return await response.text();
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
