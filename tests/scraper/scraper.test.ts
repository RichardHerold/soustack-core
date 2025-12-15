import { fetchPage } from '../../src/scraper/fetch';
import { extractJsonLd } from '../../src/scraper/extractors/jsonld';
import { extractMicrodata } from '../../src/scraper/extractors/microdata';

type MockResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
};

const mockFetch = jest.fn();

function createResponse(html: string, overrides: Partial<MockResponse> = {}): MockResponse {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => Promise.resolve(html),
    ...overrides
  };
}

describe('fetchPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('fetches page successfully', async () => {
    mockFetch.mockResolvedValueOnce(createResponse('<!DOCTYPE html><html></html>'));

    const result = await fetchPage('https://example.com', { timeout: 50, fetchFn: mockFetch });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toContain('<!DOCTYPE html>');
  });

  it('retries on transient failures', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(createResponse('<html>OK</html>'));

    const result = await fetchPage('https://retry.example', {
      maxRetries: 1,
      timeout: 50,
      fetchFn: mockFetch
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toContain('OK');
  });

  it('throws on 404 status', async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse('', { ok: false, status: 404, statusText: 'Not Found' })
    );

    await expect(
      fetchPage('https://example.com/404', { timeout: 50, fetchFn: mockFetch })
    ).rejects.toThrow('HTTP 404: Not Found');
  });
});

describe('extractJsonLd', () => {
  it('returns recipe from single script block', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Recipe", "name": "Cookies"}
      </script>
    `;

    const result = extractJsonLd(html);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Cookies');
  });

  it('handles @graph arrays', () => {
    const html = `
      <script type="application/ld+json">
        {"@graph": [
          {"@type": "WebPage"},
          {"@type": "Recipe", "name": "Cake"}
        ]}
      </script>
    `;

    expect(extractJsonLd(html)?.name).toBe('Cake');
  });

  it('considers multiple script tags', () => {
    const html = `
      <script type="application/ld+json">{"@type": "Organization"}</script>
      <script type="application/ld+json">{"@type": "Recipe", "name": "Pie"}</script>
    `;

    expect(extractJsonLd(html)?.name).toBe('Pie');
  });

  it('gracefully skips malformed JSON', () => {
    const html = `<script type="application/ld+json">{invalid json}</script>`;
    expect(extractJsonLd(html)).toBeNull();
  });

  it('supports array of @type', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": ["Recipe", "HowTo"], "name": "Bread"}
      </script>
    `;

    expect(extractJsonLd(html)?.name).toBe('Bread');
  });
});

describe('extractMicrodata', () => {
  it('extracts properties and arrays', () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Recipe">
        <h1 itemprop="name">Test Recipe</h1>
        <meta itemprop="prepTime" content="PT30M">
        <span itemprop="recipeIngredient">1 cup flour</span>
        <span itemprop="recipeIngredient">2 eggs</span>
        <div itemprop="recipeInstructions">
          <span itemprop="text">Mix well</span>
        </div>
      </div>
    `;

    const result = extractMicrodata(html);

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Test Recipe');
    expect(result?.recipeIngredient).toEqual(['1 cup flour', '2 eggs']);
    expect(result?.recipeInstructions).toEqual(['Mix well']);
  });

  it('returns null when no data found', () => {
    const html = `<div itemscope itemtype="https://schema.org/Article"></div>`;
    expect(extractMicrodata(html)).toBeNull();
  });
});
