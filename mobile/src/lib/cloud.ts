import { getApps, type FirebaseApp } from '@react-native-firebase/app';
import {
  getAuth, onAuthStateChanged, signInWithCredential, signOut,
  GoogleAuthProvider, type Auth,
} from '@react-native-firebase/auth';
import {
  getFirestore, startAfter, orderBy,
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, arrayRemove,
  arrayUnion, onSnapshot, query, where, limit, writeBatch,
  type Firestore, type Unsubscribe, type WriteBatch, type DocumentReference,
} from '@react-native-firebase/firestore';
import { GoogleOneTapSignIn } from 'react-native-nitro-google-signin';
import { Platform } from 'react-native';

import { Wallet, Expense, Category, SettlementRecord } from './types';

/**
 * Firebase is entirely optional.
 *
 * The app is local-first and must be fully usable with no account and no network,
 * so nothing here may run — or throw — until the user actually asks to sign in.
 * The native SDK reads google-services.json at startup, which is why that file is
 * required by the build even for guest-only installs.
 */

// The native SDK auto-initialises the default app from google-services.json, so
// there is normally nothing to construct here. When it is absent the usual cause is
// that google-services.json registers a different package name than the app builds
// under — say so plainly rather than failing later with an opaque auth error.
const [initialised] = getApps();
if (!initialised) {
  throw new Error(
    'Firebase did not initialise. Check that google-services.json exists and that its '
    + 'package_name matches this app\'s android package.'
  );
}
export const firebaseApp: FirebaseApp = initialised;
export const auth: Auth = getAuth(firebaseApp);

/**
 * The native Firestore SDK manages its own SQLite-backed cache and enables it by
 * default, so there is nothing to configure. This is the whole reason the app uses
 * React Native Firebase rather than the Firebase JS SDK: the JS SDK's
 * persistentLocalCache needs IndexedDB, which React Native does not have, so it
 * silently degrades to a memory-only cache and every unsynced write is lost when
 * the app is backgrounded.
 */
export const db: Firestore = getFirestore(firebaseApp);

/** Firestore error codes are not on the TS error type. */
const codeOf = (e: unknown): string =>
  (typeof e === 'object' && e !== null && 'code' in e)
    ? String((e as { code: unknown }).code)
    : '';

// Firestore rejects more than 500 writes per batch outright — not partially, the
// whole commit fails. Anything touching an unbounded set of documents goes here.
const BATCH_CHUNK_SIZE = 450;

const commitInChunks = async <T>(
  items: T[],
  apply: (batch: WriteBatch, item: T) => void
): Promise<void> => {
  for (let i = 0; i < items.length; i += BATCH_CHUNK_SIZE) {
    const batch = writeBatch(db);
    items.slice(i, i + BATCH_CHUNK_SIZE).forEach(item => apply(batch, item));
    await batch.commit();
  }
};

const deleteDocsInChunks = (refs: DocumentReference[]): Promise<void> =>
  commitInChunks(refs, (batch, ref) => batch.delete(ref));

// ---- Paths -----------------------------------------------------------------

const walletRef = (walletId: string) => doc(db, 'wallets', walletId);
const expensesRef = (walletId: string) => collection(db, 'wallets', walletId, 'expenses');
const inviteRef = (code: string) => doc(db, 'invites', code);
const userRef = (userId: string) => doc(db, 'users', userId);

export type CloudUnsubscribe = Unsubscribe;

// ---- Auth ------------------------------------------------------------------

export interface CloudUser {
  uid: string;
  displayName: string;
  email: string;
}

let googleConfigured = false;

const configureGoogle = (): void => {
  if (googleConfigured) return;
  // 'autoDetect' reads default_web_client_id out of google-services.json, so the
  // client id does not have to be duplicated in app.json.
  GoogleOneTapSignIn.configure({ webClientId: 'autoDetect' });
  googleConfigured = true;
};

/**
 * Signs in with Google.
 *
 * Returns null only when the user genuinely backed out. Every other outcome is a
 * real failure and must throw: Credential Manager reports a misconfigured OAuth
 * client (unregistered SHA-1, wrong package name) as "no saved credential", which
 * is indistinguishable from a cancel if you do not treat it as an error. Mapping it
 * to a silent null left the button appearing to do nothing at all.
 */
export const signInWithGoogle = async (): Promise<CloudUser | null> => {
  configureGoogle();

  try {
    if (Platform.OS === 'android') {
      // Rejects up front with a resolvable Play Services problem, rather than a
      // confusing failure deep inside Credential Manager.
      await GoogleOneTapSignIn.checkPlayServices(true);
    }

    const response = await GoogleOneTapSignIn.signIn();

    // Only a deliberate back-out is silent. Everything else — no credential on the
    // device, a misconfigured OAuth client, Play Services missing — must surface,
    // or the primary button in the app looks broken.
    if (response.type === 'cancelled') return null;

    if (response.type !== 'success' || !response.data?.idToken) {
      throw new Error(googleSignInHint(response.type));
    }

    const credential = GoogleAuthProvider.credential(response.data.idToken);
    const result = await signInWithCredential(auth, credential);

    const profile = result.user;
    if (!profile) throw new Error('Google sign-in did not return an account');

    return {
      uid: profile.uid,
      displayName: profile.displayName || response.data.user?.name || 'You',
      email: profile.email || response.data.user?.email || '',
    };
  } catch (e: any) {
    // A missing/unregistered signing fingerprint is by far the most common cause
    // and the least guessable, so say so rather than showing a generic failure.
    const detail = e?.message ? String(e.message) : googleSignInHint('unknown');
    throw new Error(`Google sign-in failed. ${detail}`);
  }
};

const googleSignInHint = (type: string): string => {
  switch (type) {
    case 'cancelled':
      return 'Sign-in was cancelled.';
    case 'noSavedCredentialFound':
      // Credential Manager reports a misconfigured OAuth client — an unregistered
      // signing fingerprint, or a package name that does not match — under this same
      // code as "no account on the device". The two are indistinguishable from the
      // client, so name both rather than send the user hunting for the wrong thing.
      return 'Either no Google account is on this device, or the app\'s signing '
        + 'fingerprint is not registered with Firebase yet (that takes a few minutes '
        + 'to take effect).';
    default:
      return 'Please try again in a moment.';
  }
};

export const signOutCloud = async (): Promise<void> => {
  await signOut(auth);
  try { await GoogleOneTapSignIn.signOut(); } catch { /* nothing to clear */ }
};

export const subscribeToAuth = (
  handler: (user: CloudUser | null) => void
): Unsubscribe =>
  onAuthStateChanged(auth, (user) => {
    if (!user) { handler(null); return; }
    handler({
      uid: user.uid,
      displayName: user.displayName ?? 'You',
      email: user.email ?? '',
    });
  });

// ---- Users -----------------------------------------------------------------

export const ensureUserDoc = async (user: CloudUser): Promise<void> => {
  const ref = userRef(user.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) return;
  await setDoc(ref, {
    name: user.displayName,
    email: user.email,
    customCategories: [],
    createdAt: Date.now(),
  });
};

export const getCustomCategories = async (userId: string): Promise<Category[]> => {
  try {
    const snap = await getDoc(userRef(userId));
    const value = snap.data()?.customCategories;
    return Array.isArray(value) ? (value as Category[]) : [];
  } catch {
    return [];
  }
};

export const setCustomCategories = async (
  userId: string, categories: Category[]
): Promise<void> => {
  await setDoc(userRef(userId), { customCategories: categories }, { merge: true });
};

// ---- Wallets ---------------------------------------------------------------

export const createCloudWallet = async (
  user: CloudUser, name: string, isPersonal: boolean
): Promise<string> => {
  const ref = doc(collection(db, 'wallets'));
  await setDoc(ref, {
    id: ref.id,
    name,
    ownerId: user.uid,
    members: [user.uid],
    currency: 'Rs.',
    createdAt: Date.now(),
    isPersonal,
    // A shared wallet needs its members' names up front: users/{uid} is readable
    // only by its owner, so without this nobody could be shown in the split picker
    // until they happened to log an expense.
    ...(isPersonal ? {} : { memberProfiles: { [user.uid]: user.displayName } }),
  } as Wallet);
  return ref.id;
};

export const subscribeToWallets = (
  userId: string, handler: (wallets: Wallet[]) => void
): Unsubscribe =>
  onSnapshot(
    query(collection(db, 'wallets'), where('members', 'array-contains', userId)),
    snap => {
      const wallets = snap.docs.map(d => {
        const data = d.data() as Wallet;
        return {
          ...data,
          // The document id is authoritative and `members` is read as `.length`
          // all over the UI; a hand-edited document missing either used to arrive
          // undefined and crash the switcher.
          id: d.id,
          name: typeof data.name === 'string' && data.name.length ? data.name : 'Untitled Wallet',
          members: Array.isArray(data.members) ? data.members : [userId],
        } as Wallet;
      });
      handler(wallets);
    },
    error => {
      // Rules reject an expired session; surface nothing and keep the cached list
      // rather than blanking the screen mid-use.
      console.warn('wallets subscription failed:', codeOf(error) || String(error));
    }
  );

export const getWallets = async (userId: string): Promise<Wallet[]> => {
  const snap = await getDocs(query(collection(db, 'wallets'), where('members', 'array-contains', userId)));
  return snap.docs.map(d => ({ ...(d.data() as Wallet), id: d.id }) as Wallet);
};

export const renameCloudWallet = async (walletId: string, name: string): Promise<void> => {
  await updateDoc(walletRef(walletId), { name });
};

export const updateWalletMembers = async (
  walletId: string, members: string[], profiles?: Record<string, string>
): Promise<void> => {
  await updateDoc(walletRef(walletId), {
    members,
    ...(profiles ? { memberProfiles: profiles } : {}),
  });
};

export const deleteCloudWallet = async (walletId: string): Promise<void> => {
  // Read the code first: leaving it behind keeps a deleted wallet joinable by
  // anyone still holding it, who then sees "Wallet not found" forever.
  const snap = await getDoc(walletRef(walletId));
  const code = snap.data()?.inviteCode;

  const expenses = await getDocs(expensesRef(walletId));
  await deleteDocsInChunks(expenses.docs.map(d => d.ref));
  await deleteDoc(walletRef(walletId));

  if (typeof code === 'string' && code.length > 0) {
    try { await deleteDoc(inviteRef(code)); } catch { /* already gone */ }
  }
};

// ---- Expenses --------------------------------------------------------------

export const addCloudExpense = async (expense: Expense): Promise<void> => {
  await setDoc(doc(expensesRef(expense.walletId), expense.id), expense);
};

export const updateCloudExpense = async (expense: Expense): Promise<void> => {
  await setDoc(doc(expensesRef(expense.walletId), expense.id), expense, { merge: true });
};

export const deleteCloudExpense = async (walletId: string, expenseId: string): Promise<void> => {
  await deleteDoc(doc(expensesRef(walletId), expenseId));
};

/** Documents read per round trip when paging a wallet's history. */
export const EXPENSE_PAGE_SIZE = 500;

/**
 * Hard ceiling on how many expenses are pulled into memory for one wallet.
 *
 * Reached only by heavy use — 20 pages is 10,000 entries, years of daily logging —
 * but it has to be a ceiling rather than "keep paging", or a runaway wallet would
 * page forever and lock the app up. When it is hit the caller is told, because a
 * silently truncated history is indistinguishable from lost money.
 */
export const EXPENSE_MAX_PAGES = 20;

/**
 * Loads every expense for a wallet by paging on the document id.
 *
 * A bare `limit(2000)` is the same total in fewer lines and is wrong: it returns the
 * first 2000 by id order and drops the rest with no signal, so a heavy wallet's
 * oldest or newest entries simply never appear in the app.
 */
export const fetchAllExpenses = async (
  walletId: string
): Promise<{ expenses: Expense[]; truncated: boolean }> => {
  const out: Expense[] = [];
  let cursor: ReturnType<typeof startAfter> | undefined;

  for (let page = 0; page < EXPENSE_MAX_PAGES; page++) {
    // The `orderBy` is not optional here. Cursor pagination requires an
    // explicit sort: without one Firestore rejects the query, and the catch in the
    // caller swallowed the error and left only the recent-expense subscription
    // filling the list — so a wallet with a few hundred older entries showed the
    // newest 500 and silently lost the rest. Ordering by creation time instead
    // gives a stable, human-meaningful order and needs only the default index.
    const constraints = [
      orderBy('createdAt', 'desc'),
      limit(EXPENSE_PAGE_SIZE),
      ...(cursor ? [cursor] : []),
    ];
    const snap = await getDocs(query(expensesRef(walletId), ...constraints));
    const docs = snap.docs;
    out.push(...docs.map(d => ({ ...(d.data() as Expense), id: d.id }) as Expense));
    if (docs.length < EXPENSE_PAGE_SIZE) return { expenses: out, truncated: false };
    cursor = startAfter(docs[docs.length - 1]);
  }

  return { expenses: out, truncated: true };
};

/**
 * Live updates for a wallet. The initial list comes from fetchAllExpenses; this
 * keeps it current afterwards, replacing only the wallet it is scoped to.
 */
export const subscribeToExpenses = (
  walletId: string, handler: (expenses: Expense[]) => void
): Unsubscribe =>
  onSnapshot(
    query(expensesRef(walletId), limit(EXPENSE_PAGE_SIZE)),
    snap => handler(snap.docs.map(d => ({ ...(d.data() as Expense), id: d.id }) as Expense)),
    error => console.warn('expenses subscription failed:', codeOf(error) || String(error))
  );

/**
 * Watches the *recent* end of a wallet for live changes.
 *
 * Scoped deliberately: an unbounded listener re-sends the entire history on every
 * single write, so adding an expense would re-download years of it. Ordering by
 * creation time and keeping a few hundred covers the activity that actually happens
 * while the app is open — logging, editing, settling — for a fraction of the cost.
 */
export const subscribeToRecentExpenses = (
  walletId: string, handler: (expenses: Expense[]) => void
): Unsubscribe =>
  onSnapshot(
    query(expensesRef(walletId), orderBy('createdAt', 'desc'), limit(EXPENSE_PAGE_SIZE)),
    snap => handler(snap.docs.map(d => ({ ...(d.data() as Expense), id: d.id }) as Expense)),
    error => console.warn('recent expenses subscription failed:', codeOf(error) || String(error))
  );

/** Bulk insert used by the one-time guest migration. Chunked past the 500 cap. */
export const writeCloudExpenses = async (expenses: Expense[]): Promise<void> => {
  await commitInChunks(expenses, (batch, expense) => {
    batch.set(doc(expensesRef(expense.walletId), expense.id), expense);
  });
};

export const setCloudBudget = async (walletId: string, amount: number): Promise<void> => {
  await updateDoc(walletRef(walletId), { budget: amount });
};

/** Adds a settlement to a split expense without touching the split itself. */
export const recordSettlement = async (
  expense: Expense, settlement: SettlementRecord
): Promise<void> => {
  const settlements = [...(expense.splitDetails?.settlements ?? []), settlement];
  await updateDoc(doc(expensesRef(expense.walletId), expense.id), {
    splitDetails: { ...expense.splitDetails, settlements },
  });
};

export const removeSettlement = async (expense: Expense, fromUserId: string, toUserId: string): Promise<void> => {
  const settlements = (expense.splitDetails?.settlements ?? [])
    .filter(s => !(s.fromUserId === fromUserId && s.toUserId === toUserId));
  await updateDoc(doc(expensesRef(expense.walletId), expense.id), {
    splitDetails: { ...expense.splitDetails, settlements },
  });
};

// ---- Invites ---------------------------------------------------------------

/**
 * Claims a code for a wallet and publishes it back onto the wallet document.
 *
 * Storing the code on the wallet is what lets `/invites` stay non-listable:
 * reading that collection would expose every wallet in the database and let any
 * signed-in user join any of them. Members read their own wallet's code instead.
 */
export const getOrCreateInviteCode = async (walletId: string): Promise<string> => {
  const existing = await getDoc(walletRef(walletId));
  const current = existing.data()?.inviteCode;
  if (typeof current === 'string' && current.length > 0) return current;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await allocateCode();
    try {
      await setDoc(inviteRef(code), { walletId, createdAt: Date.now() });
      // Best-effort: a losing race just means the next reader regenerates, and
      // both codes resolve to the same wallet.
      try { await updateDoc(walletRef(walletId), { inviteCode: code }); } catch { /* raced */ }
      return code;
    } catch (e: any) {
      if (codeOf(e) === 'permission-denied' || codeOf(e) === 'already-exists') continue;
      throw e;
    }
  }
  throw new Error('Could not create an invite code. Please try again.');
};

const allocateCode = async (): Promise<string> => {
  // Codes are claimed with a real write rather than generated and checked: a
  // check-then-write leaves a window where two users pick the same code.
  const { generateInviteCode } = await import('./storage');
  for (let i = 0; i < 8; i++) {
    const code = generateInviteCode();
    const snap = await getDoc(inviteRef(code));
    if (!snap.exists()) return code;
  }
  throw new Error('Could not create an invite code. Please try again.');
};

export interface JoinOutcome {
  walletId: string;
  name: string;
  alreadyMember: boolean;
}

/**
 * Redeems an invite code. The wallet read succeeding is itself the signal that the
 * caller has already joined — it is unreadable to anyone who has not — so a denial
 * there is the normal path for a genuine invite, not an error.
 */
export const joinWalletByCode = async (user: CloudUser, rawCode: string): Promise<JoinOutcome> => {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('That invite code is not valid');

  const invite = await getDoc(inviteRef(code));
  if (!invite.exists()) throw new Error('That invite code is not valid');
  const walletId = invite.data()?.walletId;
  if (typeof walletId !== 'string') throw new Error('That invite code is not valid');

  let walletName = 'Shared wallet';
  let existingProfiles: Record<string, string> = {};
  let alreadyMember = false;
  try {
    const wallet = await getDoc(walletRef(walletId));
    if (wallet.exists()) {
      const data = wallet.data();
      walletName = (data?.name as string) || walletName;
      existingProfiles = (data?.memberProfiles as Record<string, string>) ?? {};
      alreadyMember = Array.isArray(data?.members) && data!.members.includes(user.uid);
    }
  } catch { /* not a member yet — let the join write decide */ }

  try {
    if (!alreadyMember) {
      // Two writes, because the rules allow exactly two shapes and neither covers
      // both at once: `isValidWalletJoin` permits a diff touching only `members`,
      // and `memberCanSetOwnProfile` permits one touching only `memberProfiles` and
      // only the caller's own key. Writing both together is rejected.
      await updateDoc(walletRef(walletId), { members: arrayUnion(user.uid) });
    }

    // Published whether or not the membership write was needed. A join that failed
    // on the profile step left the person in `members` with no name, and returning
    // early as "already a member" meant the name was never filled in — they showed
    // up as "Someone" in every split picker forever after.
    if (existingProfiles[user.uid] !== user.displayName) {
      await updateDoc(walletRef(walletId), {
        memberProfiles: { ...existingProfiles, [user.uid]: user.displayName },
      });
    }
  } catch (e: any) {
    // The rules also reject this for reasons the user cannot be told apart from
    // outside: deleted wallet, personal (unshareable) wallet, or the member cap.
    if (codeOf(e) === 'permission-denied' || codeOf(e) === 'not-found') {
      throw new Error('That invite code is no longer valid');
    }
    throw e;
  }

  return { walletId, name: walletName, alreadyMember };
};

export const leaveCloudWallet = async (userId: string, walletId: string): Promise<void> => {
  // Only `members` may change: `memberCanLeave` rejects a diff that touches anything
  // else. The leaver's display name is deliberately left behind — once they are out
  // of `members` the profile rule no longer applies to them, and letting anyone edit
  // the map after leaving would reopen the hole the join rule closes. The name is
  // inert (it is only read for ids still in `members`), and the owner can clean it.
  await updateDoc(walletRef(walletId), { members: arrayRemove(userId) });
};

/** Moves expenses from one wallet to another, keeping ids so re-merges are no-ops. */
export const mergeCloudWallets = async (
  user: CloudUser, sourceId: string, targetId: string
): Promise<void> => {
  if (sourceId === targetId) throw new Error('Cannot merge a wallet into itself');

  const source = await getDocs(expensesRef(sourceId));
  const target = await getDocs(expensesRef(targetId));
  const existing = new Set(target.docs.map(d => d.id));

  const toMove = source.docs
    .map(d => d.data() as Expense)
    .filter(e => !existing.has(e.id))
    .map(e => ({ ...e, walletId: targetId, createdBy: { uid: user.uid, name: user.displayName } }));

  await writeCloudExpenses(toMove);
  await deleteCloudWallet(sourceId);
};

/** Wipes everything under a user. Used by "delete my account". */
export const deleteCloudAccount = async (userId: string): Promise<void> => {
  const wallets = await getWallets(userId);
  const owned = wallets.filter(w => w.ownerId === userId);
  for (const wallet of owned) {
    try { await deleteCloudWallet(wallet.id); } catch { /* best effort */ }
  }
};
