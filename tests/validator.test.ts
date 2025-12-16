import { validateRecipe } from '../src/validator';
import { Recipe } from '../src/types';

describe('Soustack validation', () => {
  const baseRecipe: Recipe = {
    name: 'Validation Example',
    title: 'Validation Example',
    recipeVersion: '1.0.0',
    ingredients: ['1 cup sugar'],
    instructions: ['Mix well'],
    metadata: { notes: 'extra' },
    'x-extra': true,
  };

  it('validates the base schema with metadata and extensions', () => {
    expect(() => validateRecipe(baseRecipe)).not.toThrow();
  });

  it('auto-detects profile validation from $schema', () => {
    const cookable: Recipe = {
      ...baseRecipe,
      $schema: 'https://raw.githubusercontent.com/RichardHerold/soustack-spec/v0.2.1/profiles/cookable.schema.json',
    };

    expect(() => validateRecipe(cookable)).not.toThrow();
  });

  it('accepts an explicit profile selection', () => {
    expect(() => validateRecipe(baseRecipe, { profile: 'base' })).not.toThrow();
  });
});
