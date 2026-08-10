import { db } from './firebase';
import { User, Expense, Wallet, Category } from '../types';
import { isSplitSumValid } from '../utils/split';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit,
  writeBatch, onSnapshot, arrayRemove, arrayUnion,
  type WriteBatch, type DocumentReference
} from 'firebase/firestore';

import {
  GUEST_DATA_KEY, GUEST_CATEGORIES_KEY, MONTHLY_BUDGET_KEY,
  DEFAULT_BUDGET, budgetKey, clearLocalData
} from '../utils/localData';

export { DEFAULT_BUDGET, clearLocalData };

// Firestore rejects a batch of more than 500 writes outright — not partially, the
// whole commit fails. Everything that touches an unbounded set of documents has to
// go through here, or it silently stops working once a wallet passes ~500 expenses.
const BATCH_CHUNK_SIZE = 450;

// Ceiling on how many expenses a wallet subscription will load at once.
export const EXPENSE_PAGE_LIMIT = 2000;

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

export const createGuestWallet = (): Wallet => ({
    id: 'guest_wallet',
    name: 'Personal Wallet',
    ownerId: 'guest',
    members: ['guest'],
    currency: 'Rs.',
    createdAt: Date.now(),
    isPersonal: true
});

export const createWallet = async (user: User, walletName: string, isPersonal: boolean = false): Promise<string> => {
    if (user.type === 'guest') throw new Error("Guests cannot create shared wallets");
    if (walletName.length > 50) throw new Error("Wallet name too long (max 50 characters)");
    
    try {
        const newWalletRef = doc(collection(db, 'wallets'));
        const newWallet: Wallet = {
            id: newWalletRef.id,
            name: walletName,
            ownerId: user.id,
            members: [user.id],
            currency: 'Rs.',
            createdAt: Date.now(),
            isPersonal: isPersonal,
            ...(isPersonal ? {} : { memberProfiles: { [user.id]: user.name } })
        };

        await setDoc(newWalletRef, newWallet);
        
        if (import.meta.env.DEV) {
            console.log('Wallet created successfully:', newWalletRef.id, isPersonal ? '(personal)' : '(shared)');
        }
        
        return newWalletRef.id;
    } catch (error: any) {
        if (import.meta.env.DEV) {
            console.error('Error creating wallet:', error);
        }
        
        if (error.code === 'permission-denied') {
            throw new Error('Permission denied. Please check your authentication.');
        } else if (error.code === 'unavailable') {
            throw new Error('Network error. Please check your connection.');
        }
        
        throw new Error('Failed to create wallet. Please try again.');
    }
};

export const getUserWallets = async (user: User): Promise<Wallet[]> => {
    if (user.type === 'guest') {
        return [createGuestWallet()];
    }

    try {
        const q = query(collection(db, 'wallets'), where('members', 'array-contains', user.id));
        const snapshot = await getDocs(q);
        
        const wallets = snapshot.docs.map(doc => doc.data() as Wallet);
        
        if (import.meta.env.DEV) {
            console.log('Fetched wallets:', wallets.length);
        }
        
        return wallets;
    } catch (error: any) {
        if (import.meta.env.DEV) {
            console.error("Error fetching wallets:", error.code, error.message);
        }

        // Deliberately throws rather than returning []. An empty array is
        // indistinguishable from "this user genuinely owns no wallets", and callers
        // reacted to that by creating a fresh Personal Wallet — so every failed read
        // minted a duplicate. Let the caller decide, and let it fall back to cache.
        throw new Error('Could not load your wallets. Please check your connection.');
    }
};

export const leaveWallet = async (user: User, walletId: string) => {
    if (user.type === 'guest') return;
    
    try {
        await updateDoc(doc(db, 'wallets', walletId), {
            members: arrayRemove(user.id)
        });
        
        if (import.meta.env.DEV) {
            console.log('Left wallet successfully:', walletId);
        }
    } catch (error: any) {
        if (import.meta.env.DEV) {
            console.error('Error leaving wallet:', error);
        }
        
        if (error.code === 'permission-denied') {
            throw new Error('Permission denied. You may not be a member of this wallet.');
        } else if (error.code === 'not-found') {
            throw new Error('Wallet not found.');
        }
        
        throw new Error('Failed to leave wallet. Please try again.');
    }
};

export const deleteWallet = async (user: User, walletId: string) => {
    if (user.type === 'guest') return;
    
    try {
        const expensesRef = collection(db, 'wallets', walletId, 'expenses');
        const snapshot = await getDocs(expensesRef);

        // Expenses first, in chunks, then the wallet itself. This is no longer one
        // atomic commit — it cannot be, past 500 documents — so a mid-way failure
        // leaves a partially emptied wallet. That is recoverable by retrying; the
        // previous single batch simply refused to delete anything at all.
        await deleteDocsInChunks(snapshot.docs.map(docSnap => docSnap.ref));
        await deleteDoc(doc(db, 'wallets', walletId));

        if (import.meta.env.DEV) {
            console.log('Wallet deleted successfully:', walletId);
        }
    } catch (error: any) {
        if (import.meta.env.DEV) {
            console.error('Error deleting wallet:', error);
        }
        
        if (error.code === 'permission-denied') {
            throw new Error('Permission denied. Only the wallet owner can delete it.');
        } else if (error.code === 'not-found') {
            throw new Error('Wallet not found.');
        }
        
        throw new Error('Failed to delete wallet. Please try again.');
    }
};

export const mergeWallets = async (user: User, sourceWalletId: string, targetWalletId: string): Promise<void> => {
    if (user.type === 'guest') throw new Error("Guests cannot merge wallets");
    if (sourceWalletId === targetWalletId) throw new Error("Cannot merge wallet into itself");
    
    try {
        const sourceExpensesRef = collection(db, 'wallets', sourceWalletId, 'expenses');
        const sourceSnapshot = await getDocs(sourceExpensesRef);
        
        if (sourceSnapshot.empty) {
            if (import.meta.env.DEV) {
                console.log('Source wallet is empty, deleting empty wallet');
            }
            const sourceWalletRef = doc(db, 'wallets', sourceWalletId);
            await deleteDoc(sourceWalletRef);
            return;
        }

        const targetExpensesRef = collection(db, 'wallets', targetWalletId, 'expenses');
        const targetSnapshot = await getDocs(targetExpensesRef);
        const existingExpenseIds = new Set(targetSnapshot.docs.map(doc => doc.id));

        const toMerge = sourceSnapshot.docs
            .map(docSnap => docSnap.data() as Expense)
            .filter(expense => !existingExpenseIds.has(expense.id));
        const skippedCount = sourceSnapshot.docs.length - toMerge.length;

        await commitInChunks(toMerge, (batch, expense) => {
            batch.set(doc(targetExpensesRef, expense.id), {
                ...expense,
                walletId: targetWalletId,
                createdBy: {
                    uid: user.id,
                    name: user.name
                }
            } as Expense);
        });

        const remainingExpensesSnapshot = await getDocs(sourceExpensesRef);
        await deleteDocsInChunks(remainingExpensesSnapshot.docs.map(docSnap => docSnap.ref));
        await deleteDoc(doc(db, 'wallets', sourceWalletId));

        const mergedCount = toMerge.length;

        if (import.meta.env.DEV) {
            console.log(`Wallet merge completed: ${mergedCount} expenses merged, ${skippedCount} duplicates skipped`);
        }
    } catch (error: any) {
        if (import.meta.env.DEV) {
            console.error('Error merging wallets:', error);
        }
        
        if (error.code === 'permission-denied') {
            throw new Error('Permission denied. You may not have access to merge these wallets.');
        } else if (error.code === 'not-found') {
            throw new Error('One or both wallets not found.');
        }
        
        throw new Error('Failed to merge wallets. Please try again.');
    }
};

export const cleanupDuplicatePersonalWallets = async (user: User): Promise<string | null> => {
    if (user.type === 'guest') return null;
    
    try {
        const allWallets = await getUserWallets(user);
        const personalWallets = allWallets.filter(w => w.isPersonal === true);
        
        if (personalWallets.length <= 1) {
            return personalWallets.length === 1 ? personalWallets[0].id : null;
        }

        if (import.meta.env.DEV) {
            console.log(`Found ${personalWallets.length} personal wallets, cleaning up duplicates...`);
        }

        const walletExpenseCounts = await Promise.all(
            personalWallets.map(async (wallet) => {
                const expensesRef = collection(db, 'wallets', wallet.id, 'expenses');
                const snapshot = await getDocs(expensesRef);
                return {
                    wallet,
                    expenseCount: snapshot.size,
                    snapshot
                };
            })
        );

        walletExpenseCounts.sort((a, b) => {
            if (b.expenseCount !== a.expenseCount) {
                return b.expenseCount - a.expenseCount;
            }
            return a.wallet.createdAt - b.wallet.createdAt;
        });

        const targetWallet = walletExpenseCounts[0].wallet;
        const walletsToMerge = walletExpenseCounts.slice(1);

        for (const { wallet } of walletsToMerge) {
            try {
                await mergeWallets(user, wallet.id, targetWallet.id);
                if (import.meta.env.DEV) {
                    console.log(`Merged wallet ${wallet.id} into ${targetWallet.id}`);
                }
            } catch (error: any) {
                if (import.meta.env.DEV) {
                    console.error(`Failed to merge wallet ${wallet.id}:`, error);
                }
            }
        }

        if (import.meta.env.DEV) {
            console.log(`Cleanup completed. Keeping personal wallet: ${targetWallet.id}`);
        }

        return targetWallet.id;
    } catch (error: any) {
        if (import.meta.env.DEV) {
            console.error('Error cleaning up duplicate personal wallets:', error);
        }
        return null;
    }
};

// Generates a 6-character invite code using the CSPRNG. Excludes characters that
// are easy to misread when a code is copied off someone else's screen (0/O, 1/I).
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateInviteCode = (): string => {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
};

export const getOrGenerateInviteCode = async (walletId: string): Promise<string> => {
    try {
        // The code is stored on the wallet document. Looking it up there (a single
        // authorised `get`) is what allows /invites to stay non-listable — listing
        // that collection would expose every wallet in the database.
        const walletRef = doc(db, 'wallets', walletId);
        const walletSnap = await getDoc(walletRef);
        const existingCode = walletSnap.exists() ? walletSnap.data()?.inviteCode : undefined;
        if (typeof existingCode === 'string' && existingCode.length > 0) {
            return existingCode;
        }

        const maxRetries = 5;
        let attempts = 0;
        
        while (attempts < maxRetries) {
            const code = generateInviteCode();

            const codeDocRef = doc(db, 'invites', code);
            const codeDoc = await getDoc(codeDocRef);

            if (!codeDoc.exists()) {
                try {
                    await setDoc(codeDocRef, {
                        walletId,
                        createdAt: Date.now()
                    });

                    // Publish the code on the wallet so members can read it back without
                    // querying /invites. Best-effort: a losing race just means the next
                    // reader regenerates, and both codes stay valid for the same wallet.
                    try {
                        await updateDoc(walletRef, { inviteCode: code });
                    } catch {
                        /* wallet already has a code, or the write raced — code still works */
                    }

                    if (import.meta.env.DEV) {
                        console.log('Invite code generated:', code);
                    }

                    return code;
                } catch (error: any) {
                    if (error.code === 'permission-denied' || error.code === 'already-exists') {
                        attempts++;
                        continue;
                    }
                    throw error;
                }
            } else {
                attempts++;
                if (import.meta.env.DEV) {
                    console.warn(`Invite code collision detected, retrying... (attempt ${attempts}/${maxRetries})`);
                }
            }
        }
        
        throw new Error('Failed to generate unique invite code after multiple attempts');
    } catch (error: any) {
        if (import.meta.env.DEV) {
            console.error('Error generating invite code:', error);
        }
        
        if (error.message.includes('unique invite code')) {
            throw error;
        }
        
        throw new Error('Failed to generate invite code. Please try again.');
    }
};

export const joinWalletByCode = async (user: User, code: string): Promise<string> => {
    try {
        const inviteDocRef = doc(db, 'invites', code.toUpperCase());
        const inviteDoc = await getDoc(inviteDocRef);
        if (!inviteDoc.exists()) {
            throw new Error("Invalid invite code");
        }

        const walletId = inviteDoc.data()?.walletId;
        if (!walletId) {
            throw new Error("Invalid invite data");
        }

        await updateDoc(doc(db, 'wallets', walletId), {
            members: arrayUnion(user.id)
        });

        // Separate write: the join rule permits changing `members` and nothing else,
        // so the name goes on afterwards. Failure here is cosmetic, not a failed join.
        try {
            await updateDoc(doc(db, 'wallets', walletId), {
                [`memberProfiles.${user.id}`]: user.name
            });
        } catch {
            /* name will be published on the next wallet switch */
        }

        if (import.meta.env.DEV) {
            console.log('Joined wallet successfully:', walletId);
        }

        return walletId;
    } catch (error: any) {
        if (import.meta.env.DEV) {
            console.error('Error joining wallet:', error);
        }
        
        if (error.message === "Invalid invite code" || error.message === "Invalid invite data") {
            throw error;
        }
        
        if (error.code === 'permission-denied') {
            throw new Error('Permission denied. Please check your authentication.');
        } else if (error.code === 'not-found') {
            throw new Error('Wallet not found.');
        }
        
        throw new Error('Failed to join wallet. Please try again.');
    }
};

const getLocalData = (): Expense[] => {
  try {
      const data = localStorage.getItem(GUEST_DATA_KEY);
      if (!data) return [];
      return JSON.parse(data);
  } catch (e) { return []; }
};

const saveLocalData = (data: Expense[]) => {
  localStorage.setItem(GUEST_DATA_KEY, JSON.stringify(data));
};

/**
 * Notifies other tabs that guest data changed.
 *
 * Guest writes replace the entire expense array, so two tabs each holding their own
 * snapshot would clobber one another — last write wins, and the other tab's entries
 * vanish with no error. The `storage` event only fires in *other* tabs, which is
 * exactly what is needed here.
 */
export const subscribeToGuestDataChanges = (onChange: () => void): (() => void) => {
  const handler = (e: StorageEvent) => {
    if (e.key === GUEST_DATA_KEY) onChange();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
};

const buildExpenseDocument = (
  expense: Omit<Expense, 'id' | 'createdAt' | 'walletId' | 'createdBy'>,
  user: User,
  activeWalletId: string
): Expense => {
  const doc: Record<string, unknown> = {
    categoryId: expense.categoryId,
    categoryName: expense.categoryName,
    categoryEmoji: expense.categoryEmoji,
    amount: expense.amount,
    note: expense.note,
    date: expense.date,
    id: crypto.randomUUID(),
    walletId: activeWalletId,
    createdBy: {
        uid: user.id,
        name: user.name
    },
    createdAt: Date.now()
  };
  
  if (expense.splitDetails) {
    doc.splitDetails = expense.splitDetails;
  }
  
  return doc as unknown as Expense;
};

export const addExpense = async (user: User, activeWalletId: string, expense: Omit<Expense, 'id' | 'createdAt' | 'walletId' | 'createdBy'>) => {
    // Cloud writes are bounded by the security rules; guest writes are not, so the
    // same limits are applied here for both.
    if (!Number.isFinite(expense.amount) || expense.amount <= 0) throw new Error("Enter an amount greater than 0");
    if (expense.amount > 1000000000) throw new Error("That amount is too large");
    if (expense.note && expense.note.length > 500) throw new Error("Note too long (max 500 characters)");

    if (expense.splitDetails) {
        const { participants, paidBy } = expense.splitDetails;
        if (!paidBy || !participants || participants.length === 0) {
            throw new Error("Invalid split details");
        }

        if (!isSplitSumValid(expense.splitDetails, expense.amount)) {
            throw new Error(`Split amounts don't match total (${expense.amount})`);
        }
    }

    const newExpense = buildExpenseDocument(expense, user, activeWalletId);

    if (user.type === 'guest') {
        const current = getLocalData();
        await new Promise(r => setTimeout(r, 10));
        saveLocalData([...current, newExpense]);
        
        if (import.meta.env.DEV) {
            console.log('Expense saved locally (guest mode)');
        }
    } else {
        try {
            await setDoc(doc(db, 'wallets', activeWalletId, 'expenses', newExpense.id), newExpense);
            
            if (import.meta.env.DEV) {
                console.log('Expense saved to Firestore:', newExpense.id);
            }
        } catch (error: any) {
            if (import.meta.env.DEV) {
                console.error('Error saving expense:', {
                    code: error.code,
                    message: error.message,
                    stack: error.stack,
                    expense: newExpense
                });
            }
            
            if (error.code === 'permission-denied') {
                throw new Error('Permission denied. You may not have access to this wallet.');
            } else if (error.code === 'unavailable') {
                throw new Error('Network error. Please check your connection and try again.');
            } else if (error.message) {
                throw new Error(`Failed to save expense: ${error.message}`);
            }
            
            throw new Error('Failed to save expense. Please try again.');
        }
    }
};

export const updateExpense = async (user: User, activeWalletId: string, expenseId: string, updates: Partial<Expense>) => {
    if (updates.amount !== undefined) {
        if (!Number.isFinite(updates.amount) || updates.amount <= 0) throw new Error("Enter an amount greater than 0");
        if (updates.amount > 1000000000) throw new Error("That amount is too large");
    }

    // Validate split sums client-side when both amount and splitDetails are provided
    if (updates.splitDetails !== undefined && updates.amount !== undefined) {
        if (!isSplitSumValid(updates.splitDetails, updates.amount)) {
            throw new Error(`Split amounts don't match total (${updates.amount})`);
        }
    }

    const allowedUpdates: Record<string, unknown> = {};
    if (updates.amount !== undefined) allowedUpdates.amount = updates.amount;
    if (updates.note !== undefined) allowedUpdates.note = updates.note;
    if (updates.splitDetails !== undefined) allowedUpdates.splitDetails = updates.splitDetails;

    if (user.type === 'guest') {
        const current = getLocalData();
        const updated = current.map(p => p.id === expenseId ? { ...p, ...allowedUpdates } : p);
        saveLocalData(updated);
        
        if (import.meta.env.DEV) {
            console.log('Expense updated locally (guest mode)');
        }
    } else {
        try {
            await updateDoc(doc(db, 'wallets', activeWalletId, 'expenses', expenseId), allowedUpdates);
            
            if (import.meta.env.DEV) {
                console.log('Expense updated in Firestore:', expenseId);
            }
        } catch (error: any) {
            if (import.meta.env.DEV) {
                console.error('Error updating expense:', error);
            }
            
            if (error.code === 'permission-denied') {
                throw new Error('Permission denied. You may not have access to this expense.');
            } else if (error.code === 'not-found') {
                throw new Error('Expense not found.');
            } else if (error.code === 'unavailable') {
                throw new Error('Network error. Please check your connection and try again.');
            }
            
            throw new Error('Failed to update expense. Please try again.');
        }
    }
};

export const getCustomCategories = async (user: User): Promise<Category[]> => {
    if (user.type === 'guest') {
        try {
            const saved = localStorage.getItem(GUEST_CATEGORIES_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    } else {
        try {
            const userDocRef = doc(db, 'users', user.id);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                const data = userDoc.data();
                return data?.customCategories || [];
            } else {
                await setDoc(userDocRef, {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    customCategories: [],
                    createdAt: Date.now()
                });
                return [];
            }
        } catch (error: any) {
            if (import.meta.env.DEV) {
                console.error('Error fetching custom categories:', error);
            }
            return [];
        }
    }
};

export const saveCustomCategories = async (user: User, categories: Category[]): Promise<void> => {
    if (user.type === 'guest') {
        localStorage.setItem(GUEST_CATEGORIES_KEY, JSON.stringify(categories));
    } else {
        try {
            const userDocRef = doc(db, 'users', user.id);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                await updateDoc(userDocRef, {
                    customCategories: categories
                });
            } else {
                await setDoc(userDocRef, {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    customCategories: categories,
                    createdAt: Date.now()
                });
            }
            if (import.meta.env.DEV) {
                console.log('Custom categories saved to Firestore');
            }
        } catch (error: any) {
            if (import.meta.env.DEV) {
                console.error('Error saving custom categories:', error);
            }
            throw new Error('Failed to save custom categories');
        }
    }
};

export const deleteExpense = async (user: User, activeWalletId: string, expenseId: string) => {
    if (user.type === 'guest') {
        const current = getLocalData();
        const filtered = current.filter(p => p.id !== expenseId);
        saveLocalData(filtered);
        
        if (import.meta.env.DEV) {
            console.log('Expense deleted locally (guest mode)');
        }
    } else {
        try {
            await deleteDoc(doc(db, 'wallets', activeWalletId, 'expenses', expenseId));
            
            if (import.meta.env.DEV) {
                console.log('Expense deleted from Firestore:', expenseId);
            }
        } catch (error: any) {
            if (import.meta.env.DEV) {
                console.error('Error deleting expense:', error);
            }
            
            if (error.code === 'permission-denied') {
                throw new Error('Permission denied. You may not have access to this expense.');
            } else if (error.code === 'not-found') {
                throw new Error('Expense not found.');
            } else if (error.code === 'unavailable') {
                throw new Error('Network error. Please check your connection and try again.');
            }
            
            throw new Error('Failed to delete expense. Please try again.');
        }
    }
};

// Re-create a previously deleted expense (used by Undo). Preserves the original id/createdAt.
export const restoreExpense = async (user: User, activeWalletId: string, expense: Expense) => {
    if (user.type === 'guest') {
        const current = getLocalData();
        const exists = current.some(p => p.id === expense.id);
        saveLocalData(exists ? current : [...current, expense]);
    } else {
        await setDoc(doc(db, 'wallets', activeWalletId, 'expenses', expense.id), expense);
    }
};

export const clearAllExpenses = async (user: User, walletId: string) => {
    if (user.type === 'guest') {
        saveLocalData([]);
        
        if (import.meta.env.DEV) {
            console.log('All expenses cleared locally (guest mode)');
        }
    } else {
        try {
            const expensesRef = collection(db, 'wallets', walletId, 'expenses');
            const snapshot = await getDocs(expensesRef);

            await deleteDocsInChunks(snapshot.docs.map(docSnap => docSnap.ref));

            if (import.meta.env.DEV) {
                console.log('All expenses cleared from Firestore:', snapshot.docs.length);
            }
        } catch (error: any) {
            if (import.meta.env.DEV) {
                console.error('Error clearing expenses:', error);
            }
            
            if (error.code === 'permission-denied') {
                throw new Error('Permission denied. You may not have access to clear expenses.');
            } else if (error.code === 'unavailable') {
                throw new Error('Network error. Please check your connection and try again.');
            }
            
            throw new Error('Failed to clear expenses. Please try again.');
        }
    }
};

export const subscribeToWalletExpenses = (
    walletId: string,
    callback: (e: Expense[]) => void,
    onError?: (error: unknown) => void
) => {
    const expensesRef = collection(db, 'wallets', walletId, 'expenses');
    // Newest first, with a ceiling. Unbounded, this re-downloaded a wallet's entire
    // history on every cold start. 2000 entries is well over five years of daily use;
    // anything older simply is not loaded, which also caps memory and read cost.
    const q = query(expensesRef, orderBy('date', 'desc'), limit(EXPENSE_PAGE_LIMIT));

    const MAX_RETRIES = 5;
    const RETRY_BASE_DELAY = 1000;
    let retries = 0;
    let unsubscribe: () => void;
    let retryTimer: ReturnType<typeof setTimeout>;

    const subscribe = () => {
        unsubscribe = onSnapshot(
            q,
            snapshot => {
                retries = 0;
                const expenses = snapshot.docs.map(doc => doc.data() as Expense);
                callback(expenses);
            },
            (error) => {
                const code = (error as any)?.code;
                // Non-retryable: permission denied, missing index — surface immediately
                if (code === 'permission-denied' || code === 'failed-precondition') {
                    onError?.(error);
                    return;
                }
                // Retryable: network blips, unavailable, internal errors
                if (retries < MAX_RETRIES) {
                    retries++;
                    const delay = RETRY_BASE_DELAY * Math.pow(2, retries - 1);
                    if (import.meta.env.DEV) {
                        console.warn(
                            `Firestore listener error (${code}), retrying in ${delay}ms (attempt ${retries}/${MAX_RETRIES})`
                        );
                    }
                    retryTimer = setTimeout(subscribe, delay);
                } else {
                    if (import.meta.env.DEV) {
                        console.error('Firestore listener exhausted retries, giving up.');
                    }
                    onError?.(error);
                }
            }
        );
    };

    subscribe();

    return () => {
        clearTimeout(retryTimer);
        unsubscribe?.();
    };
};

export const getGuestExpenses = (): Expense[] => {
    return getLocalData();
};

// Expenses still sitting in this device's local storage. Non-zero for a signed-in
// user means a previous migration did not complete and the data is stranded —
// present on the device but invisible, because cloud mode never reads local storage.
export const getPendingGuestExpenseCount = (): number => getLocalData().length;

// Publishes the current user's display name onto a shared wallet so other members can
// see who they are splitting with. Best-effort and idempotent: it only writes when the
// stored name is missing or has changed, so it is safe to call on every wallet switch.
export const ensureMemberProfile = async (user: User, wallet: Wallet): Promise<void> => {
  if (user.type === 'guest' || wallet.isPersonal || wallet.id === 'guest_wallet') return;
  if (!user.name) return;
  if (wallet.memberProfiles?.[user.id] === user.name) return;

  try {
    await updateDoc(doc(db, 'wallets', wallet.id), {
      [`memberProfiles.${user.id}`]: user.name
    });
  } catch (error: any) {
    // Non-essential: the UI falls back to names taken from expenses.
    if (import.meta.env.DEV) {
      console.error('Could not publish member profile:', error?.code, error?.message);
    }
  }
};

export const syncGuestData = async (user: User) => {
    const localData = getLocalData();
    if (localData.length === 0) {
        if (import.meta.env.DEV) {
            console.log('No guest data to sync');
        }
        return;
    }

    try {
        const existingWallets = await getUserWallets(user);
        let personalWallet = existingWallets.find(w => w.isPersonal === true);
        
        if (!personalWallet) {
            const personalWalletRef = doc(collection(db, 'wallets'));
            const newPersonalWallet: Wallet = {
                id: personalWalletRef.id,
                name: 'Personal Wallet',
                ownerId: user.id,
                members: [user.id],
                currency: 'Rs.',
                createdAt: Date.now(),
                isPersonal: true
            };
            await setDoc(personalWalletRef, newPersonalWallet);
            personalWallet = newPersonalWallet;
        }

        // Chunked: a guest with a couple of years of daily expenses would otherwise
        // exceed the batch limit and could never migrate at all.
        await commitInChunks(localData, (batch, p) => {
            const ref = doc(db, 'wallets', personalWallet!.id, 'expenses', p.id);
            const expenseWithMeta: Expense = {
                ...p,
                walletId: personalWallet!.id,
                createdBy: { uid: user.id, name: user.name }
            };
            batch.set(ref, expenseWithMeta);
        });

        // Only now is it safe to drop the local copy.
        localStorage.removeItem(GUEST_DATA_KEY);
        
        if (import.meta.env.DEV) {
            console.log('Guest data synced to Firestore:', localData.length, 'expenses');
        }

        await cleanupDuplicatePersonalWallets(user);
    } catch (error: any) {
        if (import.meta.env.DEV) {
            console.error('Error syncing guest data:', error);
        }
        
        throw new Error('Failed to sync guest data. Your data is still saved locally.');
    }
};

// Guest restore: the local store holds one array, so it is replaced wholesale with
// the already-merged list.
export const replaceGuestExpenses = (expenses: Expense[]): void => {
  saveLocalData(expenses);
};

// Cloud restore: write expenses into the wallet the user is currently looking at.
//
// The previous version wrote each row to the walletId recorded *inside the backup
// file*. A backup taken in guest mode carries walletId 'guest_wallet', which does not
// exist in Firestore, so every write was denied and reported as "skipped" — the most
// common restore scenario (lost phone, signed in on a new one) imported nothing at
// all. Rows are retargeted at `targetWalletId` instead.
//
// Written one document at a time on purpose: the security rules validate each expense
// independently, so a single malformed row in a hand-edited backup would take a whole
// batch down with it. This trades speed for an accurate per-row skipped count.
export const importExpensesToWallet = async (
  user: User,
  expenses: Expense[],
  targetWalletId: string
): Promise<{ imported: number; skipped: number }> => {
  let imported = 0;
  let skipped = 0;

  for (const expense of expenses) {
    try {
      const retargeted: Expense = {
        ...expense,
        walletId: targetWalletId,
        createdBy: { uid: user.id, name: user.name }
      };
      await setDoc(doc(db, 'wallets', targetWalletId, 'expenses', expense.id), retargeted);
      imported++;
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error('Skipped expense during import:', expense.id, error?.code, error?.message);
      }
      skipped++;
    }
  }

  return { imported, skipped };
};

// Removes only the expenses this user created from a wallet somebody else owns.
// The security rules let a member delete their own expenses but not other people's,
// so a blanket wallet delete would be rejected and leave everything behind.
const deleteOwnExpensesInWallet = async (user: User, walletId: string) => {
  const q = query(
    collection(db, 'wallets', walletId, 'expenses'),
    where('createdBy.uid', '==', user.id)
  );
  const snapshot = await getDocs(q);
  await deleteDocsInChunks(snapshot.docs.map(d => d.ref));
};

// Delete a user's account data.
// - Wallets they own are deleted outright, along with their expenses.
// - Wallets they merely joined keep existing for the other members, but the user's
//   own expenses are removed and the user leaves. Previously these wallets were
//   handed to deleteWallet, which is owner-only: the write failed, the error was
//   swallowed, and the user's expenses — carrying their real display name — stayed
//   in other people's wallets forever with no account left to remove them.
// Throws if anything could not be removed, so the caller does NOT delete the auth
// user and the operation stays retryable.
// Caller is responsible for signing the user out afterwards.
export const deleteAccount = async (user: User): Promise<void> => {
  if (user.type === 'guest') {
    clearLocalData();
    return;
  }

  try {
    const wallets = await getUserWallets(user);
    const failed: string[] = [];

    for (const wallet of wallets) {
      try {
        if (wallet.ownerId === user.id) {
          await deleteWallet(user, wallet.id);
        } else {
          await deleteOwnExpensesInWallet(user, wallet.id);
          await leaveWallet(user, wallet.id);
        }
      } catch (error: any) {
        if (import.meta.env.DEV) {
          console.error(`Failed to clear wallet ${wallet.id} during account deletion:`, error);
        }
        failed.push(wallet.name || wallet.id);
      }
    }

    try {
      await deleteDoc(doc(db, 'users', user.id));
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error('Failed to delete user document:', error);
      }
      failed.push('your profile');
    }

    if (failed.length > 0) {
      throw new Error(
        `Could not remove your data from: ${failed.join(', ')}. Your account has not been deleted — please check your connection and try again.`
      );
    }

    clearLocalData();

    if (import.meta.env.DEV) {
      console.log('Account data deletion completed for user:', user.id);
    }
  } catch (error: any) {
    if (import.meta.env.DEV) {
      console.error('Error during account deletion:', error);
    }
    // Preserve the detailed message built above; only generic failures get rewritten.
    if (error instanceof Error && error.message.startsWith('Could not remove your data')) {
      throw error;
    }
    throw new Error('Failed to delete account. Please try again.');
  }
};

export const getStoredBudget = async (user: User | null, walletId: string | undefined): Promise<number> => {
  if (user?.type === 'user' && walletId && walletId !== 'guest_wallet') {
    try {
      const walletRef = doc(db, 'wallets', walletId);
      const walletSnap = await getDoc(walletRef);
      if (walletSnap.exists()) {
        const data = walletSnap.data();
        if (typeof data.budget === 'number') {
          return data.budget;
        }
      }
    } catch {
      // Fall through to localStorage
    }
  }
  // Scoped key first, then the pre-v0.8 global key so an existing budget carries over
  // to the wallet the user was last using instead of silently resetting to the default.
  const scoped = localStorage.getItem(budgetKey(walletId));
  const raw = scoped !== null ? scoped : localStorage.getItem(MONTHLY_BUDGET_KEY);
  const parsed = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_BUDGET;
};

export const saveStoredBudget = async (user: User | null, walletId: string | undefined, amount: number) => {
  localStorage.setItem(budgetKey(walletId), amount.toString());
  if (user?.type === 'user' && walletId && walletId !== 'guest_wallet') {
    try {
      const walletRef = doc(db, 'wallets', walletId);
      await updateDoc(walletRef, { budget: amount });
    } catch (error: any) {
      // Best-effort: the scoped localStorage value above still holds on this device.
      if (import.meta.env.DEV) {
        console.error('Failed to sync budget to Firestore:', error);
      }
    }
  }
};
