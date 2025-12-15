import { normalizeImage } from '../../src/utils/image';

describe('normalizeImage', () => {
  it('returns string URLs unchanged', () => {
    expect(normalizeImage('https://example.com/one.jpg')).toBe('https://example.com/one.jpg');
  });

  it('preserves arrays of string URLs', () => {
    expect(
      normalizeImage(['https://example.com/a.jpg', 'https://example.com/b.jpg'])
    ).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
  });

  it('extracts URLs from ImageObjects', () => {
    expect(normalizeImage({ url: 'https://example.com/object.jpg' })).toBe(
      'https://example.com/object.jpg'
    );
  });

  it('extracts URLs from ImageObject arrays', () => {
    expect(
      normalizeImage([{ url: 'https://example.com/a.jpg' }, { url: 'https://example.com/b.jpg' }])
    ).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
  });

  it('returns undefined for nullish or empty inputs', () => {
    expect(normalizeImage(undefined)).toBeUndefined();
    expect(normalizeImage(null)).toBeUndefined();
    expect(normalizeImage([])).toBeUndefined();
  });

  it('handles mixed arrays with strings and objects', () => {
    expect(
      normalizeImage(['https://example.com/string.jpg', { url: 'https://example.com/object.jpg' }])
    ).toEqual(['https://example.com/string.jpg', 'https://example.com/object.jpg']);
  });
});
