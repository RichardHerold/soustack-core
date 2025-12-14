import type { RequestInit } from 'node-fetch';
import * as cheerio from 'cheerio';
import { fromSchemaOrg } from './fromSchemaOrg';
import { Recipe } from './types';

const USER_AGENT =
  'soustack-convert/1.0 (+https://github.com/RichardHerold/soustack-core)';

let fetchImpl: ((url: string, init?: RequestInit) => Promise<any>) | null = null;

async function ensureFetch() {
  if (!fetchImpl) {
    const module = await import('node-fetch');
    fetchImpl = module.default as (url: string, init?: RequestInit) => Promise<any>;
  }
  return fetchImpl;
}

export async function scrapeRecipe(url: string): Promise<Recipe> {
  const fetch = await ensureFetch();
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml'
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to load ${url}: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const schemaOrg = extractSchemaOrg(html);
  if (!schemaOrg) {
    throw new Error('No Schema.org recipe data found in page');
  }

  const recipe = fromSchemaOrg(schemaOrg);
  if (!recipe) {
    throw new Error('Schema.org data did not include a valid recipe');
  }

  return recipe;
}

function extractSchemaOrg(html: string): unknown {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');

  for (let i = 0; i < scripts.length; i++) {
    const node = scripts[i];
    const text = $(node).contents().toString().trim();
    if (!text) continue;

    try {
      const json = JSON.parse(text);
      const recipe = findRecipeNode(json);
      if (recipe) {
        return recipe;
      }
    } catch (err) {
      // Some publishers include invalid JSON-LD. Ignore parse errors and continue.
      continue;
    }
  }

  return undefined;
}

function findRecipeNode(data: unknown): unknown {
  if (!data) return undefined;

  if (Array.isArray(data)) {
    for (const entry of data) {
      const result = findRecipeNode(entry);
      if (result) return result;
    }
    return undefined;
  }

  if (typeof data !== 'object') {
    return undefined;
  }

  const record = data as Record<string, any>;

  if (matchesRecipeType(record['@type'])) {
    return record;
  }

  if (record['@graph']) {
    return findRecipeNode(record['@graph']);
  }

  return undefined;
}

function matchesRecipeType(value: unknown): boolean {
  if (!value) return false;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'recipe';
  }
  if (Array.isArray(value)) {
    return value.some(entry => typeof entry === 'string' && matchesRecipeType(entry));
  }
  return false;
}
