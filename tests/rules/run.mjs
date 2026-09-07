/**
 * Security-rules test suite.
 *
 *   npm run test:rules
 *
 * Every case here corresponds to a defect found during the production-readiness
 * audit. The rules are the entire authorization model of this app — there is no
 * server — so a change that loosens one of these is a data breach, not a bug.
 */
import { call, seed, patch, check, describe, report } from './helpers.mjs';

const A = 'userA';       // ordinary member
const B = 'userB';       // wallet owner and expense creator
const OUTSIDER = 'userC';

// --- fixtures -----------------------------------------------------------------
const shared = (id, extra = {}) => ({
  id, name: 'Flat', ownerId: B, members: [A, B],
  currency: 'Rs.', createdAt: 1700000000000, isPersonal: false, ...extra,
});

const personal = (id) => ({
  id, name: 'Personal', ownerId: B, members: [B],
  currency: 'Rs.', createdAt: 1700000000000, isPersonal: true,
});

const settlement = (from, to, by) => ({
  fromUserId: from, toUserId: to, amount: 50,
  settledAt: 1700000000000, settledBy: by,
});

const split = (settlements) => ({
  splitType: 'equal',
  paidBy: B,
  participants: [
    { userId: A, userName: 'A', amount: 50 },
    { userId: B, userName: 'B', amount: 50 },
  ],
  ...(settlements ? { settlements } : {}),
});

const expense = (id, creator, extra = {}) => ({
  id, walletId: 'w', categoryId: 'food', categoryName: 'Food', categoryEmoji: '🍔',
  amount: 100, note: '', date: '2026-08-09',
  createdBy: { uid: creator, name: creator }, createdAt: 1700000000000, ...extra,
});

const W = 'w';
const EXPENSE_PATH = `/wallets/${W}/expenses/e1`;

const resetWallet = (extra = {}) => seed(`/wallets/${W}`, shared(W, extra));
const resetExpense = (settlements) =>
  seed(EXPENSE_PATH, { ...expense('e1', B), walletId: W, splitDetails: split(settlements) });

// ==============================================================================
describe('Invites — must never be enumerable (KB-01)');
{
  await seed('/invites/ABC123', { walletId: W, createdAt: 1700000000000 });
  const list = await call('POST', ':runQuery', {
    uid: A,
    body: { structuredQuery: { from: [{ collectionId: 'invites' }] } },
  });
  check('listing every invite code', false, list.status);
  const get = await call('GET', '/invites/ABC123', { uid: A });
  check('reading one code you already know', true, get.status);

  // An invite whose wallet still exists must stay put — deleting it would silently
  // revoke a code other people are already holding.
  await resetWallet();
  await seed('/invites/LIVE01', { walletId: W, createdAt: 1700000000000 });
  check('deleting a live wallet\'s invite', false,
    (await call('DELETE', '/invites/LIVE01', { uid: A })).status);

  // Once the wallet is gone the code grants access to nothing, so it may be reaped.
  // Left behind, it stayed resolvable and anyone redeeming it hit "Wallet not found".
  await call('DELETE', `/wallets/${W}`);
  await seed('/invites/DEAD01', { walletId: W, createdAt: 1700000000000 });
  check('reaping an invite whose wallet was deleted', true,
    (await call('DELETE', '/invites/DEAD01', { uid: A })).status);

  await resetWallet();
  await seed('/invites/LIVE02', { walletId: W, createdAt: 1700000000000 });
  check('repointing an invite at another wallet', false,
    (await patch(A, '/invites/LIVE02', { walletId: 'attacker-wallet' })).status);
}

// ==============================================================================
describe('Wallet join — one member added, nothing else touched (KB-02)');
{
  await resetWallet();
  check('outsider adds themselves', true,
    (await patch(OUTSIDER, `/wallets/${W}`, { members: [A, B, OUTSIDER] }, ['members'])).status);

  await resetWallet();
  check('joiner evicts existing members', false,
    (await patch(OUTSIDER, `/wallets/${W}`, { members: [OUTSIDER] }, ['members'])).status);

  await resetWallet();
  check('joiner seizes ownership', false,
    (await patch(OUTSIDER, `/wallets/${W}`, { members: [A, B, OUTSIDER], ownerId: OUTSIDER },
      ['members', 'ownerId'])).status);

  await resetWallet();
  check('joiner adds two members at once', false,
    (await patch(OUTSIDER, `/wallets/${W}`, { members: [A, B, OUTSIDER, 'userD'] }, ['members'])).status);

  await seed(`/wallets/wp`, personal('wp'));
  check('outsider joins a personal wallet', false,
    (await patch(OUTSIDER, `/wallets/wp`, { members: [B, OUTSIDER] }, ['members'])).status);

  await resetWallet();
  check('member leaves', true,
    (await patch(A, `/wallets/${W}`, { members: [B] }, ['members'])).status);

  // KB-60: "leaving" must remove exactly one member — yourself. Unchecked, a member
  // could submit an empty list and evict everyone, including the owner, who would
  // then be locked out of reading their own wallet.
  await resetWallet();
  check('member leaves and takes everyone else with them', false,
    (await patch(A, `/wallets/${W}`, { members: [] }, ['members'])).status);

  await resetWallet();
  check('member leaves and swaps in an outsider', false,
    (await patch(A, `/wallets/${W}`, { members: [OUTSIDER] }, ['members'])).status);

  await resetWallet();
  check('non-owner deletes the wallet', false,
    (await call('DELETE', `/wallets/${W}`, { uid: A })).status);
}

// ==============================================================================
describe('Budget (KB-10)');
{
  await resetWallet();
  check('member sets budget', true, (await patch(A, `/wallets/${W}`, { budget: 15000 })).status);
  await resetWallet();
  check('outsider sets budget', false, (await patch(OUTSIDER, `/wallets/${W}`, { budget: 1 })).status);
  await resetWallet();
  check('negative budget', false, (await patch(A, `/wallets/${W}`, { budget: -5 })).status);
  await resetWallet();
  check('budget as a string', false, (await patch(A, `/wallets/${W}`, { budget: 'lots' })).status);
  await resetWallet();
  check('budget used as cover to rename the wallet', false,
    (await patch(A, `/wallets/${W}`, { budget: 100, name: 'Hijacked' })).status);
}

// ==============================================================================
describe('Invite code publication (KB-01)');
{
  await resetWallet();
  check('member publishes the code', true,
    (await patch(A, `/wallets/${W}`, { inviteCode: 'K7M2QP' })).status);
  await resetWallet({ inviteCode: 'K7M2QP' });
  check('member rotates an existing code', false,
    (await patch(A, `/wallets/${W}`, { inviteCode: 'ZZZZZZ' })).status);
  await resetWallet();
  check('outsider publishes a code', false,
    (await patch(OUTSIDER, `/wallets/${W}`, { inviteCode: 'K7M2QP' })).status);
}

// ==============================================================================
describe('Member profiles — your own name only (KB-36)');
{
  await resetWallet();
  check('member sets own name', true,
    (await patch(A, `/wallets/${W}`, { memberProfiles: { [A]: 'Asha' } }, [`memberProfiles.${A}`])).status);

  await resetWallet({ memberProfiles: { [A]: 'Asha', [B]: 'Bikash' } });
  check('member renames someone else', false,
    (await patch(A, `/wallets/${W}`, { memberProfiles: { [A]: 'Asha', [B]: 'Hacked' } })).status);

  await resetWallet({ memberProfiles: { [A]: 'Asha', [B]: 'Bikash' } });
  check("member deletes someone else's name", false,
    (await patch(A, `/wallets/${W}`, { memberProfiles: { [A]: 'Asha' } })).status);

  await resetWallet();
  check('empty name', false,
    (await patch(A, `/wallets/${W}`, { memberProfiles: { [A]: '' } }, [`memberProfiles.${A}`])).status);

  await resetWallet();
  check('61-character name', false,
    (await patch(A, `/wallets/${W}`, { memberProfiles: { [A]: 'x'.repeat(61) } }, [`memberProfiles.${A}`])).status);
}

// ==============================================================================
describe('Expenses — read and write scope');
{
  await resetWallet();
  await seed(EXPENSE_PATH, { ...expense('e1', B), walletId: W });

  check('member reads an expense', true, (await call('GET', EXPENSE_PATH, { uid: A })).status);
  check('outsider reads an expense', false, (await call('GET', EXPENSE_PATH, { uid: OUTSIDER })).status);
  check("member deletes someone else's expense", false,
    (await call('DELETE', EXPENSE_PATH, { uid: A })).status);
  check('creator deletes their own expense', true,
    (await call('DELETE', EXPENSE_PATH, { uid: B })).status);

  check('expense whose walletId does not match its path', false,
    (await call('PATCH', `/wallets/${W}/expenses/e9`, {
      uid: A, body: { fields: (await import('./helpers.mjs')).F({ ...expense('e9', A), walletId: 'other' }) },
    })).status);

  check('expense attributed to another user', false,
    (await call('PATCH', `/wallets/${W}/expenses/e8`, {
      uid: A, body: { fields: (await import('./helpers.mjs')).F({ ...expense('e8', B), walletId: W }) },
    })).status);

  // KB-62: only the known fields may be written. `hasAll` alone let a member pad an
  // expense out to Firestore's 1 MiB limit, and every other member synced it down.
  check('expense create carrying an unknown field', false,
    (await call('PATCH', `/wallets/${W}/expenses/e7`, {
      uid: A,
      body: { fields: (await import('./helpers.mjs')).F({ ...expense('e7', A), padding: 'x'.repeat(2000) }) },
    })).status);

  // KB-63: the 500-character note cap applied on create, but not on update.
  await seed(`/wallets/${W}/expenses/e6`, expense('e6', A));
  check('creator stretches a note past 500 characters', false,
    (await patch(A, `/wallets/${W}/expenses/e6`, { note: 'x'.repeat(501) })).status);
  check('creator writes a 500-character note', true,
    (await patch(A, `/wallets/${W}/expenses/e6`, { note: 'x'.repeat(500) })).status);
}

// ==============================================================================
describe('Settlements (KB-05, KB-12, KB-53)');
{
  const sA = settlement(A, B, A);
  const sB = settlement(B, A, B);

  // KB-12: the field is absent until the first settlement is recorded.
  await resetWallet(); await resetExpense(undefined);
  check('debtor records the first settlement', true,
    (await patch(A, EXPENSE_PATH, { splitDetails: split([sA]) })).status);

  await resetExpense(undefined);
  check('first settlement forged as another user', false,
    (await patch(A, EXPENSE_PATH, { splitDetails: split([settlement(B, A, B)]) })).status);

  // KB-05: reversal.
  await resetExpense([sA]);
  check('reversing your own settlement', true,
    (await patch(A, EXPENSE_PATH, { splitDetails: split([]) })).status);

  await resetExpense([sB]);
  check("reversing someone else's settlement", false,
    (await patch(A, EXPENSE_PATH, { splitDetails: split([]) })).status);

  await resetExpense([sA, sB]);
  check('removing two settlements in one write', false,
    (await patch(A, EXPENSE_PATH, { splitDetails: split([]) })).status);

  await resetExpense([sA]);
  check('swapping a settlement for a forged one', false,
    (await patch(A, EXPENSE_PATH, { splitDetails: split([settlement(B, A, A)]) })).status);

  // KB-61: appending is allowed; rewriting what is already there is not. Validating
  // only the last entry left every earlier settlement editable in the same write.
  await resetExpense([sA]);
  check('appending a valid settlement while inflating an older one', false,
    (await patch(A, EXPENSE_PATH, {
      splitDetails: split([{ ...sA, amount: 9999 }, settlement(B, A, A)]),
    })).status);

  await resetExpense([sA]);
  check('appending a valid settlement in front of the existing one', false,
    (await patch(A, EXPENSE_PATH, {
      splitDetails: split([settlement(B, A, B), sA]),
    })).status);

  await resetExpense([sA]);
  check('appending a second settlement, leaving the first alone', true,
    (await patch(A, EXPENSE_PATH, { splitDetails: split([sA, settlement(B, A, A)]) })).status);

  // KB-53: a settlement write must not double as a way to rewrite the split.
  await resetExpense(undefined);
  check('settling while editing participant amounts', false,
    (await patch(A, EXPENSE_PATH, {
      splitDetails: {
        splitType: 'equal', paidBy: B,
        participants: [{ userId: A, userName: 'A', amount: 0 }, { userId: B, userName: 'B', amount: 100 }],
        settlements: [sA],
      },
    })).status);

  await resetExpense(undefined);
  check('settling while reassigning who paid', false,
    (await patch(A, EXPENSE_PATH, { splitDetails: { ...split([sA]), paidBy: A } })).status);

  await resetExpense([sA]);
  check('outsider reverses a settlement', false,
    (await patch(OUTSIDER, EXPENSE_PATH, { splitDetails: split([]) })).status);

  // KB-44: the creditor can record that they were paid, not just the debtor.
  await resetExpense(undefined);
  check('creditor records that they were paid', true,
    (await patch(B, EXPENSE_PATH, { splitDetails: split([settlement(A, B, B)]) })).status);

  await resetExpense([settlement(A, B, B)]);
  check('creditor reverses the settlement they recorded', true,
    (await patch(B, EXPENSE_PATH, { splitDetails: split([]) })).status);

  await resetExpense([settlement(A, B, B)]);
  check('debtor reverses a settlement the creditor recorded', false,
    (await patch(A, EXPENSE_PATH, { splitDetails: split([]) })).status);
}

// ==============================================================================
describe('User documents — self only');
{
  await seed(`/users/${B}`, { id: B, name: 'B', email: 'b@example.com', customCategories: [], createdAt: 1 });
  check('reading your own document', true, (await call('GET', `/users/${B}`, { uid: B })).status);
  check("reading another user's document", false, (await call('GET', `/users/${B}`, { uid: A })).status);
  check('changing another user\'s categories', false,
    (await patch(A, `/users/${B}`, { customCategories: [] })).status);
  check('changing your own email', false,
    (await patch(B, `/users/${B}`, { email: 'new@example.com' })).status);
}

report();
