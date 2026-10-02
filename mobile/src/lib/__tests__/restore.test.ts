import { describe, it, expect } from 'vitest';
import {
  buildRestorePlan, remapExpenses, countOrphanedExpenses, dedupeCategories, matchExistingWallets,
} from '../restore';
import { sanitizeBackupExpenses } from '../backup';
import type { BackupData, Expense, Wallet } from '../types';

/**
 * The first restore implementation merged a backup's expenses into whichever
 * wallet was open and left each row's `walletId` pointing at a wallet from another
 * account. Every read filters by the active wallet, so those rows were invisible
 * immediately after a "successful" restore. These cover the shapes that actually
 * occur: a legacy multi-wallet file, and a file whose expenses reference a wallet
 * the file never declared.
 */

const OLD_UID = '1CRM5qEyQGdSJQdUwoeEAwYfLmw2';
const NEW_UID = 'new-account-uid';

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  walletId: 'w-personal',
  categoryId: 'food',
  categoryName: 'Food',
  categoryEmoji: '🍔',
  amount: 300,
  note: 'Snacks',
  date: '2026-09-27',
  createdBy: { uid: OLD_UID, name: 'Old Account' },
  createdAt: 1790485537841,
  ...over,
});

const wallet = (over: Partial<Wallet> = {}): Wallet => ({
  id: 'w-personal',
  name: 'Personal Wallet',
  ownerId: OLD_UID,
  members: [OLD_UID],
  currency: 'Rs.',
  createdAt: 1783644910002,
  isPersonal: true,
  ...over,
});

const backup = (data: Partial<BackupData['data']> = {}): BackupData => ({
  version: '0.9.4',
  exportDate: '2026-09-29T04:46:33.995Z',
  userId: OLD_UID,
  data: {
    expenses: [],
    wallets: [wallet()],
    budget: 45000,
    customCategories: [],
    ...data,
  },
});

const plan = (b: BackupData, valid: Expense[]) =>
  buildRestorePlan(b, valid, NEW_UID, 'New Account');

describe('restore plan', () => {
  it('rebuilds every wallet in the file, not just the open one', () => {
    const b = backup({
      wallets: [wallet(), wallet({ id: 'w-test', name: 'Test', isPersonal: false })],
    });
    const p = plan(b, [expense()]);

    expect(p.wallets.map(w => w.wallet.name)).toEqual(['Personal Wallet', 'Test']);
    // Both wallets must be creatable, or the second one's expenses have nowhere to go.
    expect(p.wallets.every(w => w.wallet.id === '')).toBe(true);
  });

  it('attributes every row to the importing account, not the exporting one', () => {
    const p = plan(backup(), [expense()]);
    const rows = [...p.expensesBySourceWallet.values()].flat();

    expect(rows).toHaveLength(1);
    expect(rows[0].createdBy.uid).toBe(NEW_UID);
    expect(rows[0].createdBy.name).toBe('New Account');
  });

  it('transfers ownership of restored wallets to the importer', () => {
    const b = backup({
      wallets: [wallet({ isPersonal: false, members: [OLD_UID, 'someone-else'] })],
    });
    const p = plan(b, []);

    const restored = p.wallets[0].wallet;
    expect(restored.ownerId).toBe(NEW_UID);
    // Carrying the original members over would leave the wallet unreadable.
    expect(restored.members).toEqual([NEW_UID]);
  });

  it('drops the memberProfiles map so no other identity is retained', () => {
    const b = backup({
      wallets: [wallet({
        memberProfiles: { 'someone-else': 'Someone Else' } as never,
      })],
    });
    expect(plan(b, []).wallets[0].wallet.memberProfiles).toBeUndefined();
  });

  it('keeps expenses grouped by the wallet they came from', () => {
    const b = backup({
      wallets: [wallet(), wallet({ id: 'w-test', name: 'Test' })],
    });
    const p = plan(b, [
      expense({ id: 'a', walletId: 'w-personal' }),
      expense({ id: 'b', walletId: 'w-test' }),
      expense({ id: 'c', walletId: 'w-test' }),
    ]);

    expect(p.expensesBySourceWallet.get('w-personal')?.map(e => e.id)).toEqual(['a']);
    expect(p.expensesBySourceWallet.get('w-test')?.map(e => e.id)).toEqual(['b', 'c']);
  });

  it('assigns pre-multiwallet rows with no walletId to the first wallet', () => {
    // Rows written before wallets existed have no walletId; they are not orphans.
    const p = plan(backup(), [expense({ walletId: '' as unknown as string })]);
    // Routed onto the declared personal wallet, so it survives the remap.
    expect(p.expensesBySourceWallet.get('w-personal')?.map(e => e.id)).toEqual(['e1']);
    expect(countOrphanedExpenses(p)).toBe(0);
    expect(remapExpenses(p, new Map([['w-personal', 'NEW_A']])).map(r => r.walletId)).toEqual(['NEW_A']);
  });

  it('reports expenses pointing at a wallet the file never declared', () => {
    // Silently dropping these would look like a successful restore that lost rows.
    const p = plan(backup({ wallets: [wallet()] }), [
      expense({ id: 'ok', walletId: 'w-personal' }),
      expense({ id: 'orphan', walletId: 'w-vanished' }),
    ]);

    expect(p.missingWallets).toEqual(['w-vanished']);
    expect(countOrphanedExpenses(p)).toBe(1);
    // Still recoverable by hand, so they are kept rather than deleted.
    expect(p.expensesBySourceWallet.get('w-vanished')).toHaveLength(1);
  });

  it('creates one personal wallet when the file declares none', () => {
    const p = plan(backup({ wallets: [] }), [expense({ walletId: '' as unknown as string })]);
    expect(p.wallets).toHaveLength(1);
    expect(p.wallets[0].wallet.isPersonal).toBe(true);
    expect(remapExpenses(p, new Map([['', 'NEW_A']]))).toHaveLength(1);
  });

  it('remaps rows onto the ids the newly created wallets were given', () => {
    const b = backup({
      wallets: [wallet(), wallet({ id: 'w-test', name: 'Test' })],
    });
    const p = plan(b, [
      expense({ id: 'a', walletId: 'w-personal' }),
      expense({ id: 'b', walletId: 'w-test' }),
    ]);

    const rows = remapExpenses(p, new Map([['w-personal', 'NEW_A'], ['w-test', 'NEW_B']]));
    expect(rows.find(r => r.id === 'a')?.walletId).toBe('NEW_A');
    expect(rows.find(r => r.id === 'b')?.walletId).toBe('NEW_B');
  });

  it('does not emit rows for a wallet that was never created', () => {
    const p = plan(backup({ wallets: [wallet()] }), [
      expense({ id: 'orphan', walletId: 'w-vanished' }),
    ]);
    const rows = remapExpenses(p, new Map([['w-personal', 'NEW_A']]));
    expect(rows).toHaveLength(0);
  });

  it('carries custom categories across, including the legacy colour strings', () => {
    const b = backup({
      customCategories: [
        { id: 'custom_digital_tech', name: 'Digital Tech', emoji: '🖥️', color: 'bg-slate-100 text-slate-600' } as never,
      ],
    });
    expect(plan(b, []).categories.map(c => c.name)).toEqual(['Digital Tech']);
  });

  it('preserves amounts, dates and notes exactly', () => {
    // A restore that alters a value is worse than one that fails: it produces a
    // ledger that disagrees with the bank and looks authoritative.
    const original = expense({ amount: 33402.34, date: '2026-09-02', note: 'Installment for car' });
    const p = plan(backup(), [original]);
    const [row] = [...p.expensesBySourceWallet.values()].flat();

    expect(row.amount).toBe(33402.34);
    expect(row.date).toBe('2026-09-02');
    expect(row.note).toBe('Installment for car');
    expect(row.id).toBe(original.id);
  });
});

describe('a real 37-row September backup', () => {
  const rows: Expense[] = Array.from({ length: 37 }, (_, i) =>
    expense({
      id: `e-${i}`,
      walletId: 'w-personal',
      date: `2026-09-${String((i % 27) + 1).padStart(2, '0')}`,
      amount: 100 + i,
    }));

  it('restores every row with no wallet folding', () => {
    const b = backup({ wallets: [wallet(), wallet({ id: 'w-test', name: 'Test', isPersonal: false })] });
    const { valid, rejected } = sanitizeBackupExpenses(rows);
    expect(rejected).toBe(0);

    const p = plan(b, valid);
    const remapped = remapExpenses(p, new Map([['w-personal', 'NEW_A'], ['w-test', 'NEW_B']]));

    expect(remapped).toHaveLength(37);
    expect(countOrphanedExpenses(p)).toBe(0);
    // Every row now points at a wallet that actually exists.
    expect(new Set(remapped.map(r => r.walletId))).toEqual(new Set(['NEW_A']));
  });
});
describe('re-running a restore', () => {
  it('does not duplicate a custom category', () => {
    // Legacy ids are deterministic, so a second restore appended a second row under
    // the same id and React threw on duplicate keys — the screen failed to render.
    const existing = [
      { id: 'custom_digital_tech', name: 'Digital Tech', emoji: '🖥️', color: 'bg-slate-100 text-slate-600' } as never,
    ];
    const incoming = [...existing, { id: 'custom_pet_care', name: 'Pet Care', emoji: '🐾', color: 'bg-slate-100 text-slate-600' } as never];

    const out = dedupeCategories(existing, incoming);
    expect(out.map(c => c.id)).toEqual(['custom_pet_care']);
  });

  it('treats a differently-named row with the same name as a duplicate', () => {
    const existing = [{ id: 'custom_x', name: 'Pet Care', emoji: '🐶', color: '' } as never];
    const incoming = [{ id: 'custom_y', name: 'pet care', emoji: '🐾', color: '' } as never];
    expect(dedupeCategories(existing, incoming)).toHaveLength(0);
  });

  it('keeps genuinely new categories', () => {
    const out = dedupeCategories([], [
      { id: 'custom_a', name: 'A', emoji: '🅰️', color: '' } as never,
      { id: 'custom_b', name: 'B', emoji: '🅱️', color: '' } as never,
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('a backup with several new categories', () => {
  it('keeps every new category, not just the last one', () => {
    // The restore used to loop over addCustomCategory, which assigns rather than
    // appends functionally and closed over the same pre-restore list on every call.
    // Two new categories therefore wrote [existing, second] and dropped the first,
    // silently — the account ended up with one category instead of two.
    const existing = [
      { id: 'custom_a', name: 'Alpha', emoji: '🅰️', color: '' } as never,
    ];
    const incoming = [
      { id: 'custom_b', name: 'Beta', emoji: '🅱️', color: '' } as never,
      { id: 'custom_c', name: 'Gamma', emoji: '🅲️', color: '' } as never,
    ];

    const newCategories = dedupeCategories(existing, incoming);
    expect(newCategories.map(c => c.id)).toEqual(['custom_b', 'custom_c']);
    // The single batched write the store performs.
    expect([...existing, ...newCategories].map(c => c.id)).toEqual([
      'custom_a', 'custom_b', 'custom_c',
    ]);
  });

  it('adds nothing at all when every category is already present', () => {
    const existing = [
      { id: 'custom_a', name: 'Alpha', emoji: '🅰️', color: '' } as never,
    ];
    expect(dedupeCategories(existing, [...existing])).toHaveLength(0);
  });
});

describe('matchExistingWallets', () => {
  it('reuses a wallet with the same name instead of creating a second copy', () => {
    // Two exports of one ledger were restored in turn and produced two "Personal
    // Wallet"s holding one ledger between them, with no obvious winner to merge by.
    const b = backup();
    const p = plan(b, [expense()]);
    const out = matchExistingWallets(p, [{ id: 'cloud-abc', name: 'Personal Wallet' }]);
    expect(out.get('w-personal')).toBe('cloud-abc');
  });

  it('ignores case and surrounding space', () => {
    const p = plan(backup(), [expense()]);
    const out = matchExistingWallets(p, [{ id: 'cloud-abc', name: '  personal wallet ' }]);
    expect(out.get('w-personal')).toBe('cloud-abc');
  });

  it('leaves unmatched wallets to be created', () => {
    const p = plan(backup(), [expense()]);
    expect(matchExistingWallets(p, [{ id: 'x', name: 'Holiday' }]).size).toBe(0);
  });

  it('never maps two source wallets onto the same existing wallet', () => {
    // Two source wallets sharing a name would otherwise both merge into one, and
    // the second wallet's rows would land under a wallet id nobody sees.
    const b = backup({
      wallets: [wallet(), wallet({ id: 'w-2', name: 'Personal Wallet' })],
    });
    const p = plan(b, [expense(), expense({ id: 'e2', walletId: 'w-2' })]);
    const out = matchExistingWallets(p, [{ id: 'cloud-abc', name: 'Personal Wallet' }]);
    expect(out.size).toBe(1);
    expect([...out.values()]).toEqual(['cloud-abc']);
  });
});
