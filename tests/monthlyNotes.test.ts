import { describe, it, expect } from 'vitest';
import { createSeedBudgetSnapshot } from '../src/data/seedBudget';
import { useBudgetStore } from '../src/store/budgetStore';

describe('monthly notes', () => {
  it('updateMonthlyNote persists a monthly note on the year record', () => {
    const seed = createSeedBudgetSnapshot();
    useBudgetStore.setState({ snapshot: seed });
    const year = seed.settings.selectedYear;
    const month = seed.settings.selectedMonth;
    useBudgetStore.getState().updateMonthlyNote(year, month, 'Test note');
    const record = useBudgetStore.getState().snapshot.years[String(year)];
    expect(record.monthlyNotes[month].note).toBe('Test note');

    // Clearing the note
    useBudgetStore.getState().updateMonthlyNote(year, month, '');
    expect(useBudgetStore.getState().snapshot.years[String(year)].monthlyNotes[month]).toBeUndefined();
  });
});
