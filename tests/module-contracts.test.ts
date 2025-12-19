import { validateRecipe } from '../src/validator';
import { Recipe } from '../src/types';

describe('Stack contract unit tests', () => {
  const baseRecipe: Recipe = {
    '@type': 'Recipe',
    profile: 'minimal',
    name: 'Test Recipe',
    ingredients: ['1 cup flour'],
    instructions: ['Mix'],
  };

  describe('attribution stack contract', () => {
    it('fails when attribution payload exists without module declaration', () => {
      const recipe = {
        ...baseRecipe,
        attribution: { url: 'https://example.com' },
        stacks: {},
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(false);
    });

    it('fails when attribution@1 declared without payload', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { attribution: 1 },
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(false);
    });

    it('passes when both declaration and payload exist', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { attribution: 1 },
        attribution: { url: 'https://example.com', author: 'Test Author' },
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(true);
    });
  });

  describe('taxonomy stack contract', () => {
    it('fails when taxonomy payload exists without module declaration', () => {
      const recipe = {
        ...baseRecipe,
        taxonomy: { keywords: ['test'] },
        stacks: {},
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(false);
    });

    it('fails when taxonomy@1 declared without payload', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { taxonomy: 1 },
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(false);
    });

    it('passes when both declaration and payload exist', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { taxonomy: 1 },
        taxonomy: { keywords: ['test'], category: 'Dessert' },
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(true);
    });
  });

  describe('media stack contract', () => {
    it('fails when media payload exists without module declaration', () => {
      const recipe = {
        ...baseRecipe,
        media: { images: ['https://example.com/image.jpg'] },
        stacks: {},
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(false);
    });

    it('fails when media@1 declared without payload', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { media: 1 },
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(false);
    });

    it('passes when both declaration and payload exist', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { media: 1 },
        media: { images: ['https://example.com/image.jpg'] },
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(true);
    });
  });

  describe('times stack contract', () => {
    it('fails when times payload exists without module declaration', () => {
      const recipe = {
        ...baseRecipe,
        times: { prepMinutes: 10 },
        stacks: {},
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(false);
    });

    it('fails when times@1 declared without payload', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { times: 1 },
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(false);
    });

    it('passes when both declaration and payload exist', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { times: 1 },
        times: { prepMinutes: 10, cookMinutes: 20, totalMinutes: 30 },
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(true);
    });
  });

  describe('nutrition stack contract', () => {
    it('fails when nutrition payload exists without module declaration', () => {
      const recipe = {
        ...baseRecipe,
        nutrition: { calories: 100 },
        stacks: {},
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(false);
    });

    it('fails when nutrition@1 declared without payload', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { nutrition: 1 },
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(false);
    });

    it('passes when both declaration and payload exist', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { nutrition: 1 },
        nutrition: { calories: 100, protein_g: 5 },
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(true);
    });
  });

  describe('schedule stack contract', () => {
    it('fails when schedule payload exists without module declaration', () => {
      const recipe = {
        ...baseRecipe,
        profile: 'core', // schedule requires core profile
        schedule: { tasks: [{ id: 't1', description: 'Test' }] },
        stacks: {},
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(false);
    });

    it('fails when schedule@1 declared without payload', () => {
      const recipe = {
        ...baseRecipe,
        profile: 'core',
        stacks: { schedule: 1 },
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(false);
    });

    it('passes when both declaration and payload exist', () => {
      const recipe = {
        ...baseRecipe,
        profile: 'core',
        stacks: { schedule: 1 },
        schedule: { tasks: [{ id: 't1', description: 'Test task' }] },
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(true);
    });
  });

  describe('multiple stacks contract', () => {
    it('validates multiple stacks correctly', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { attribution: 1, taxonomy: 1, times: 1 },
        attribution: { url: 'https://example.com' },
        taxonomy: { keywords: ['test'] },
        times: { prepMinutes: 10 },
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(true);
    });

    it('fails if any stack is missing its payload', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { attribution: 1, taxonomy: 1, times: 1 },
        attribution: { url: 'https://example.com' },
        taxonomy: { keywords: ['test'] },
        // times payload missing
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(false);
    });

    it('fails if any payload is missing its stack declaration', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { attribution: 1, taxonomy: 1 },
        attribution: { url: 'https://example.com' },
        taxonomy: { keywords: ['test'] },
        times: { prepMinutes: 10 }, // payload exists but stack not declared
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(false);
    });
  });
});

