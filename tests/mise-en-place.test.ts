import { miseEnPlace, type Ingredient } from '../src/mise-en-place';

function getIngredients(): Ingredient[] {
  return [
    {
      id: 'onion',
      item: 'Yellow Onion',
      quantity: { amount: 1, unit: 'whole' },
      prepActions: ['Peel', 'Dice'],
      notes: 'large'
    },
    {
      id: 'celery',
      item: 'Celery',
      quantity: { amount: 2, unit: 'stalks' },
      prepAction: 'Dice'
    },
    {
      id: 'brown-sugar',
      item: 'Brown Sugar',
      quantity: { amount: 200, unit: 'g' },
      form: 'Packed'
    },
    {
      id: 'butter',
      item: 'Unsalted Butter',
      quantity: { amount: 113, unit: 'g' }
    },
    {
      id: 'parsley',
      item: 'Flat-leaf Parsley',
      prep: 'Chop roughly',
      notes: 'stems ok'
    },
    {
      id: 'cream-cheese',
      item: 'Cream Cheese',
      form: 'Softened',
      quantity: { amount: 225, unit: 'g' }
    }
  ];
}

describe('miseEnPlace', () => {
  it('groups prep actions into separate tasks and includes shared items', () => {
    const plan = miseEnPlace(getIngredients());

    const prepTasks = plan.tasks.filter((task) => task.category === 'prep');

    expect(prepTasks.map((task) => task.action)).toEqual(['dice', 'peel']);

    const diceTask = prepTasks.find((task) => task.action === 'dice');
    expect(diceTask?.items.map((item) => item.ingredient)).toEqual(['Yellow Onion', 'Celery']);

    const peelTask = prepTasks.find((task) => task.action === 'peel');
    expect(peelTask?.items.map((item) => item.ingredient)).toEqual(['Yellow Onion']);
  });

  it('groups forms into state tasks', () => {
    const plan = miseEnPlace(getIngredients());

    const stateTasks = plan.tasks.filter((task) => task.category === 'state');

    expect(stateTasks.map((task) => task.form)).toEqual(['packed', 'softened']);
    const packedTask = stateTasks.find((task) => task.form === 'packed');
    expect(packedTask?.items[0]?.ingredient).toBe('Brown Sugar');
  });

  it('adds standalone quantities to the measure task', () => {
    const plan = miseEnPlace(getIngredients());

    const measureTask = plan.tasks.find((task) => task.category === 'measure');
    expect(measureTask).toBeDefined();
    expect(measureTask?.items.map((item) => item.ingredient)).toEqual(['Unsalted Butter']);
  });

  it('routes textual prep instructions to the other task and preserves notes', () => {
    const plan = miseEnPlace(getIngredients());

    const otherTask = plan.tasks.find((task) => task.category === 'other');
    expect(otherTask).toBeDefined();
    expect(otherTask?.items[0]?.ingredient).toBe('Flat-leaf Parsley');
    expect(otherTask?.items[0]?.notes).toBe('Chop roughly | stems ok');
  });

  it('preserves ingredient order within each task', () => {
    const plan = miseEnPlace(getIngredients());
    const diceTask = plan.tasks.find((task) => task.category === 'prep' && task.action === 'dice');

    expect(diceTask?.items.map((item) => item.ingredient)).toEqual(['Yellow Onion', 'Celery']);
  });
});
