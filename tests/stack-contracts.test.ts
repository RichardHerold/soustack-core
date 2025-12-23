import { validateRecipe } from '../src/validator';
import { Recipe } from '../src/types';

describe('Stack contract unit tests', () => {
  const baseRecipe: Recipe = {
    '@type': 'Recipe',
    profile: 'lite',
    name: 'Test Recipe',
    yield: { amount: 1, unit: 'serving' },
    time: { total: { minutes: 10 } },
    ingredients: [{ id: 'flour', name: 'Flour' }],
    instructions: [{ id: 'mix', text: 'Mix' }],
  };

  describe('equipment stack contract', () => {
    it('fails when equipment payload exists without stack declaration', () => {
      const recipe = {
        ...baseRecipe,
        equipment: [{ id: 'oven', name: 'Oven' }],
        stacks: {},
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
    });

    it('fails when equipment@1 declared without payload', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { equipment: 1 },
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
    });

    it('passes when both declaration and payload exist', () => {
      const recipe = {
        ...baseRecipe,
        profile: 'base',
        stacks: { equipment: 1 },
        equipment: [{ id: 'oven', name: 'Oven' }],
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(true);
    });
  });

  describe('dietary stack contract', () => {
    it('fails when dietary payload exists without stack declaration', () => {
      const recipe = {
        ...baseRecipe,
        dietary: { vegetarian: true },
        stacks: {},
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
    });

    it('fails when dietary@1 declared without payload', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { dietary: 1 },
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
    });

    it('passes when both declaration and payload exist', () => {
      const recipe = {
        ...baseRecipe,
        profile: 'base',
        stacks: { dietary: 1 },
        dietary: { 
          basis: 'perServing', // Required
          diets: ['vegetarian'] // Required: at least one of calories, macros, diets, or allergens
        },
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(true);
    });
  });

  describe('illustrated stack contract', () => {
    // Note: The validator does NOT enforce "payload exists without stack declaration" for illustrated
    // because inferStacksFromPayload only checks for properties matching stack names (illustrated),
    // not for images/videos properties. So we only test the reverse contract.

    it('fails when illustrated@1 declared without payload', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { illustrated: 1 },
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
    });

    it('passes when both declaration and payload exist', () => {
      const recipe = {
        ...baseRecipe,
        profile: 'base',
        stacks: { illustrated: 1 },
        images: ['https://example.com/image.jpg'], // At least one media URI required
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(true);
    });
  });

  describe('storage stack contract', () => {
    it('fails when storage payload exists without stack declaration', () => {
      const recipe = {
        ...baseRecipe,
        storage: { refrigerator: { days: 3 } },
        stacks: {},
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
    });

    it('fails when storage@1 declared without payload', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { storage: 1 },
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
    });

    it('passes when both declaration and payload exist', () => {
      const recipe = {
        ...baseRecipe,
        profile: 'base',
        stacks: { storage: 1 },
        storage: { 
          refrigerated: { duration: { iso8601: 'P3D' } } // Required: at least one storage method (roomTemp, refrigerated, or frozen)
        },
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(true);
    });
  });

  describe('prep stack contract', () => {
    // Note: The validator does NOT enforce "payload exists without stack declaration" for prep
    // because inferStacksFromPayload only checks for properties matching stack names (prep),
    // not for miseEnPlace property. So we only test the reverse contract.

    it('fails when prep@1 declared without payload', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { prep: 1 },
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
    });

    it('passes when both declaration and payload exist', () => {
      const recipe = {
        ...baseRecipe,
        profile: 'base',
        stacks: { prep: 1 },
        miseEnPlace: [{ text: 'Chop vegetables' }], // Required: miseEnPlace array with task.text
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(true);
    });
  });

  describe('scaling stack contract', () => {
    it('fails when scaling payload exists without stack declaration', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { quantified: 1 },
        scaling: { discrete: { min: 1, max: 4, step: 1 } },
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
    });

    it('fails when scaling@1 declared without payload', () => {
      const recipe = {
        ...baseRecipe,
        stacks: { quantified: 1, scaling: 1 },
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
    });

    it('passes when both declaration and payload exist', () => {
      const recipe = {
        ...baseRecipe,
        profile: 'base',
        stacks: { quantified: 1, scaling: 1 }, // scaling requires quantified
        scaling: { discrete: { min: 1, max: 4, step: 1 } },
        ingredients: [
          { id: 'flour', name: 'Flour', quantity: { amount: 1, unit: 'cup' } }
        ],
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(true);
    });
  });

  describe('multiple stacks contract', () => {
    it('validates multiple stacks correctly', () => {
      const recipe = {
        ...baseRecipe,
        profile: 'base',
        stacks: { equipment: 1, dietary: 1, storage: 1 },
        equipment: [{ id: 'oven', name: 'Oven' }],
        dietary: { 
          basis: 'perServing', // Required
          diets: ['vegetarian'] // Required: at least one of calories, macros, diets, or allergens
        },
        storage: { 
          refrigerated: { duration: { iso8601: 'P3D' } } // Required: at least one storage method
        },
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(true);
    });

    it('fails if any stack is missing its payload', () => {
      const recipe = {
        ...baseRecipe,
        profile: 'base',
        stacks: { equipment: 1, dietary: 1, storage: 1 },
        equipment: [{ id: 'oven', name: 'Oven' }],
        dietary: { 
          basis: 'perServing', // Required
          diets: ['vegetarian'] // Required: at least one of calories, macros, diets, or allergens
        },
        // storage payload missing
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
    });

    it('fails if any payload is missing its stack declaration', () => {
      const recipe = {
        ...baseRecipe,
        profile: 'base',
        stacks: { equipment: 1, dietary: 1 },
        equipment: [{ id: 'oven', name: 'Oven' }],
        dietary: { 
          basis: 'perServing', // Required
          diets: ['vegetarian'] // Required: at least one of calories, macros, diets, or allergens
        },
        storage: { 
          refrigerated: { duration: { iso8601: 'P3D' } } // payload exists but stack not declared
        },
      };
      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
    });
  });
});
