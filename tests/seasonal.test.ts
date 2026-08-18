import { describe, it, expect } from 'vitest';
import { createSeedBudgetSnapshot } from '../src/data/seedBudget';
import { useBudgetStore } from '../src/store/budgetStore';

describe('seasonal presets', () => {
  it('applySeasonalPreset updates selectedSeason on the snapshot', () => {
    const seed = createSeedBudgetSnapshot();
    const preset = seed.seasonalPresets && seed.seasonalPresets[0];
    if (!preset) throw new Error('No seasonal presets in seed');

    // Set the store to the seed snapshot
    useBudgetStore.setState({ snapshot: seed });

    // Apply preset
    useBudgetStore.getState().applySeasonalPreset(preset.id);

    const s = useBudgetStore.getState().snapshot;
    expect(s.settings.selectedSeason).toBe(preset.season);
  });
});
