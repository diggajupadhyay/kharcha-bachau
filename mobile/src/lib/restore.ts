import { Expense, Wallet, Category, BackupData } from './types';

/**
 * Restores a backup into the current app.
 *
 * The first version of this only merged `expenses` into whichever wallet happened
 * to be open, which is fine for a single-wallet backup and quietly wrong for any
 * other: a legacy file carrying two wallets had one of them silently folded into
 * the other, with the expense rows keeping `walletId` values that matched no
 * wallet that existed. The rows were then invisible, because every read filters by
 * the active wallet. That is data loss with no error — the worst kind.
 *
 * So a restore now rebuilds the wallet structure first and re-homes every expense
 * onto the wallet it actually belonged to.
 */

/** What a completed restore did, so the UI can report it rather than guess. */
export interface RestoreSummary {
  wallets: number;
  expenses: number;
  categories: number;
  /** Rows that failed validation and were skipped. */
  rejected: number;
  /** Rows whose wallet the file never declared. */
  orphaned: number;
}

export interface RestorePlan {
  /** Wallets to create, in backup order. */
  wallets: Array<{ sourceId: string; wallet: Wallet }>;
  /** Expenses keyed by the source wallet id they belong to. */
  expensesBySourceWallet: Map<string, Expense[]>;
  categories: Category[];
  /** Legacy wallet ids that are referenced by expenses but absent from the file. */
  missingWallets: string[];
}

/**
 * Rewrites a legacy `createdBy` so the row is attributed to the account importing
 * it.
 *
 * The original uid belonged to the exporting account. If that account is a
 * different person — a backup file gets emailed around — keeping their uid on the
 * row leaves the expense owned by someone with no access to the wallet it now
 * lives in, and the Firestore rules reject the write outright.
 */
const reattribute = (expense: Expense, uid: string, name: string): Expense => ({
  ...expense,
  createdBy: { uid, name },
});

/**
 * Category ids already present are dropped from the plan.
 *
 * The legacy ids are deterministic (`custom_digital_tech`), so replaying the same
 * backup twice produced two rows under one id — React throws on duplicate keys, so
 * the whole screen failed to render rather than showing a duplicate. De-duplicating
 * here makes a restore idempotent.
 */
export const dedupeCategories = (existing: Category[], incoming: Category[]): Category[] => {
  const byId = new Set(existing.map(c => c.id));
  const byName = new Set(existing.map(c => c.name.toLowerCase()));
  const out: Category[] = [];
  for (const c of incoming) {
    if (byId.has(c.id) || byName.has(c.name.toLowerCase())) continue;
    byId.add(c.id);
    byName.add(c.name.toLowerCase());
    out.push(c);
  }
  return out;
};

export const buildRestorePlan = (
  backup: BackupData,
  validExpenses: Expense[],
  currentUid: string,
  currentName: string
): RestorePlan => {
  // Wallets come from the file where present. A file with none at all still has to
  // land somewhere, so the caller gets a single personal wallet to hold the rows.
  const sourceWallets = backup.data.wallets?.length
    ? backup.data.wallets
    : [{ id: '', name: 'Personal Wallet', isPersonal: true } as unknown as Wallet];

  const wallets = sourceWallets.map(w => ({
    sourceId: typeof w.id === 'string' ? w.id : '',
    wallet: {
      ...w,
      id: '',
      // Ownership follows whoever restores, never the file. Members carried over
      // from another account would leave the wallet unreadable for everyone.
      ownerId: currentUid,
      members: [currentUid],
      isPersonal: w.isPersonal !== false,
      memberProfiles: undefined,
    } as Wallet,
  }));

  // Rows written before wallets existed carry no walletId. They belong to the
  // personal wallet, which is the only thing the old single-wallet app had, so
  // they are routed to the first wallet here rather than being counted as orphans
  // and dropped.
  const fallbackSourceId = wallets[0]?.sourceId ?? '';

  const expensesBySourceWallet = new Map<string, Expense[]>();
  const known = new Set<string>();

  for (const raw of validExpenses) {
    const sourceId = typeof raw.walletId === 'string' && raw.walletId.length > 0
      ? raw.walletId
      : fallbackSourceId;
    const expense = reattribute(raw, currentUid, currentName);
    const bucket = expensesBySourceWallet.get(sourceId);
    if (bucket) bucket.push(expense);
    else expensesBySourceWallet.set(sourceId, [expense]);
    known.add(sourceId);
  }

  const declared = new Set(wallets.map(w => w.sourceId));
  const missingWallets = [...known].filter(id => !declared.has(id));

  return {
    wallets,
    expensesBySourceWallet,
    categories: backup.data.customCategories ?? [],
    missingWallets,
  };
};

/**
 * Maps each wallet in a restore plan onto an already-existing wallet of the same
 * name, so restoring two backups of one ledger merges instead of duplicating it.
 *
 * Backup ids are useless here: they are dropped on create because Firestore hands
 * out its own. Name is the only identity a user would recognise across two exports.
 * The first match wins, so the mapping is stable when the names repeat.
 */
export const matchExistingWallets = (
  plan: RestorePlan,
  existing: Pick<Wallet, 'id' | 'name'>[]
): Map<string, string> => {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const { sourceId, wallet } of plan.wallets) {
    const target = existing.find(
      w => !taken.has(w.id) && w.name.trim().toLowerCase() === wallet.name.trim().toLowerCase()
    );
    if (!target) continue;
    taken.add(target.id);
    out.set(sourceId, target.id);
  }
  return out;
};

/**
 * Reassigns wallet ids created by `buildRestorePlan` onto the expenses pointing at
 * the old ones. Pure, so it can be tested without touching storage or the network.
 */
export const remapExpenses = (
  plan: RestorePlan,
  idBySourceId: Map<string, string>
): Expense[] => {
  const out: Expense[] = [];
  for (const [sourceId, rows] of plan.expensesBySourceWallet) {
    const target = idBySourceId.get(sourceId);
    if (!target) continue;
    for (const row of rows) out.push({ ...row, walletId: target });
  }
  return out;
};

/**
 * How many expenses in the file belong to no wallet the file declares. Those rows
 * would be dropped silently, so the count is shown rather than swallowed.
 */
export const countOrphanedExpenses = (plan: RestorePlan): number => {
  let n = 0;
  for (const sourceId of plan.missingWallets) {
    n += plan.expensesBySourceWallet.get(sourceId)?.length ?? 0;
  }
  return n;
};