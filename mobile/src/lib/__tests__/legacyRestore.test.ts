import { describe, it, expect } from 'vitest';
import { sanitizeBackupExpenses, isValidBackupExpense, validateBackup } from '../backup';
import type { Expense } from '../types';

/**
 * The webapp was replaced by the native app, but its data is not lost — it lives in
 * the same Firestore project and the same backup shape. What can go wrong is a
 * restore silently dropping rows, so these cover the shapes a legacy file
 * actually contains rather than the shape the current app writes.
 */

const base = {
  id: 'exp-1',
  walletId: 'wallet-1',
  categoryId: 'food',
  categoryName: 'Food',
  categoryEmoji: '🍔',
  amount: 250,
  note: '',
  date: '2026-09-14',
  createdBy: { uid: 'uid-1', name: 'Asha' },
  createdAt: 1757808000000,
};

describe('legacy webapp backups', () => {
  it('accepts a document written by the webapp', () => {
    expect(isValidBackupExpense(base)).toBe(true);
  });

  it('accepts a split expense with participants and a payer', () => {
    const split: Expense = {
      ...base,
      splitDetails: {
        splitType: 'equal',
        participants: [
          { userId: 'uid-1', userName: 'Asha', amount: 150 },
          { userId: 'uid-2', userName: 'Bikash', amount: 100 },
        ],
        paidBy: 'uid-1',
      },
    };
    expect(isValidBackupExpense(split)).toBe(true);
  });

  it('keeps every September row in a full-month backup', () => {
    // The real loss scenario: 30 daily entries, and a validator that quietly
    // rejects a handful leaves a month with holes nobody notices until they
    // reconcile against a bank statement.
    const september: unknown[] = Array.from({ length: 30 }, (_, i) => ({
      ...base,
      id: `exp-${i}`,
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    }));

    const { valid, rejected } = sanitizeBackupExpenses(september);
    expect(valid).toHaveLength(30);
    expect(rejected).toBe(0);
    expect(valid.map(e => e.date)).toContain('2026-09-01');
    expect(valid.map(e => e.date)).toContain('2026-09-30');
  });

  it('rejects a row with an impossible date rather than importing it', () => {
    // `new Date('2026-02-30')` rolls forward to March 2, so without an explicit
    // check the row imports and then silently shifts month on the ledger.
    expect(isValidBackupExpense({ ...base, date: '2026-02-30' })).toBe(false);
    expect(isValidBackupExpense({ ...base, date: '14/09/2026' })).toBe(false);
  });

  it('rejects a row with no amount, so a zero-value entry cannot import', () => {
    expect(isValidBackupExpense({ ...base, amount: 0 })).toBe(false);
    expect(isValidBackupExpense({ ...base, amount: NaN })).toBe(false);
    expect(isValidBackupExpense({ ...base, amount: -100 })).toBe(false);
  });

  it('rejects a row missing its author, which the cloud rules also require', () => {
    expect(isValidBackupExpense({ ...base, createdBy: undefined })).toBe(false);
    expect(isValidBackupExpense({ ...base, createdBy: { uid: 'u' } })).toBe(false);
  });

  it('counts rejections so the UI can say how many were skipped', () => {
    const { valid, rejected } = sanitizeBackupExpenses([
      base,
      { ...base, id: 'bad-1', date: 'nonsense' },
      { ...base, id: 'bad-2', amount: 0 },
      null,
      'not an object',
    ]);
    expect(valid).toHaveLength(1);
    expect(rejected).toBe(4);
  });

  it('validates the legacy envelope, including the optional userId', () => {
    // The webapp wrote `userId` at the top level; the current writer omits it.
    // Both must load, or a legacy file is refused wholesale.
    const legacy = {
      version: '0.9.6',
      exportDate: '2026-09-30T10:00:00.000Z',
      userId: 'uid-1',
      data: { expenses: [base], wallets: [], budget: 20000, customCategories: [] },
    };
    expect(validateBackup(legacy)).toBe(true);

    const current = { ...legacy };
    delete (current as { userId?: string }).userId;
    expect(validateBackup(current)).toBe(true);
  });

  it('rejects an envelope missing a required collection', () => {
    const bad = {
      version: '0.9.6',
      exportDate: '2026-09-30T10:00:00.000Z',
      data: { expenses: [base], budget: 20000, customCategories: [] },
    };
    expect(validateBackup(bad)).toBe(false);
  });
});