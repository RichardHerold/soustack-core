import equipmentScalingFixture from '../spec/fixtures/valid/equipment-scaling-rules.valid.json';
import { scaleRecipe } from '../src/parser';
import { Equipment, ScaledRecipe } from '../src/types';

describe('equipment scaling', () => {
  it('applies count scaling rules for equipment@1', () => {
    const scaled = scaleRecipe(equipmentScalingFixture as any, { multiplier: 3 }) as ScaledRecipe;

    expect(findEquipment(scaled.equipment, 'pan')?.count).toBe(1); // fixed
    expect(findEquipment(scaled.equipment, 'bowl')?.count).toBe(6); // linear: ceil(2 * 3)
    expect(findEquipment(scaled.equipment, 'sheet_pan')?.count).toBe(3); // threshold: F=3 falls into maxFactor 4
  });

  it('returns upgrade recommendations when scale factor matches', () => {
    const scaled = scaleRecipe(equipmentScalingFixture as any, { multiplier: 2 }) as ScaledRecipe;

    expect(scaled.scaling?.equipment?.upgrades).toEqual([
      { fromId: 'skillet_small', use: 'skillet_large', minFactor: 2 }
    ]);
  });

  it('uses the last threshold step when exceeding maxFactor', () => {
    const scaled = scaleRecipe(equipmentScalingFixture as any, { multiplier: 5 }) as ScaledRecipe;

    expect(findEquipment(scaled.equipment, 'sheet_pan')?.count).toBe(3); // last step count
  });
});

function findEquipment(items: (Equipment | string)[] | undefined, id: string): Equipment | undefined {
  if (!items) return undefined;
  return items.find(item => typeof item !== 'string' && item.id === id) as Equipment | undefined;
}
