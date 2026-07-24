import { db } from './firebase';
import { User, Expense, Wallet, Category } from '../types';
import { isSplitSumValid } from '../utils/split';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit,
  writeBatch, onSnapshot, arrayRemove, arrayUnion,
  DocumentData
} from 'firebase/firestore';

const GUEST_DATA_KEY = 'daily_expenses_guest_v1';
const MONTHLY_BUDGET_KEY = 'daily_expenses_budget_monthly';
const GUEST_CATEGORIES_KEY = 'kharcha_bachau_custom_categories_guest';

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
            isPersonal: isPersonal
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
        
        return [];
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
        
        const batch = writeBatch(db);
        snapshot.docs.forEach((docSnap) => {
            batch.delete(docSnap.ref);
        });
        
        const walletRef = doc(db, 'wallets', walletId);
        batch.delete(walletRef);

        await batch.commit();
        
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

        const batch = writeBatch(db);
        let mergedCount = 0;
        let skippedCount = 0;

        sourceSnapshot.docs.forEach((docSnap) => {
            const expense = docSnap.data() as Expense;
            
            if (existingExpenseIds.has(expense.id)) {
                skippedCount++;
                if (import.meta.env.DEV) {
                    console.log(`Skipping duplicate expense: ${expense.id}`);
                }
            } else {
                const newExpenseRef = doc(targetExpensesRef, expense.id);
                const mergedExpense: Expense = {
                    ...expense,
                    walletId: targetWalletId,
                    createdBy: {
                        uid: user.id,
                        name: user.name
                    }
                };
                batch.set(newExpenseRef, mergedExpense);
                mergedCount++;
            }
        });

        await batch.commit();

        const deleteBatch = writeBatch(db);
        
        const remainingExpensesSnapshot = await getDocs(sourceExpensesRef);
        remainingExpensesSnapshot.docs.forEach((docSnap) => {
            deleteBatch.delete(docSnap.ref);
        });
        
        const sourceWalletRef = doc(db, 'wallets', sourceWalletId);
        deleteBatch.delete(sourceWalletRef);
        
        await deleteBatch.commit();

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

export const getOrGenerateInviteCode = async (walletId: string): Promise<string> => {
    try {
        const q = query(collection(db, 'invites'), where('walletId', '==', walletId), limit(1));
        const existing = await getDocs(q);
        if (!existing.empty) {
            return existing.docs[0].id;
        }

        const maxRetries = 5;
        let attempts = 0;
        
        while (attempts < maxRetries) {
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();
            
            const codeDocRef = doc(db, 'invites', code);
            const codeDoc = await getDoc(codeDocRef);
            
            if (!codeDoc.exists()) {
                try {
                    await setDoc(codeDocRef, {
                        walletId,
                        createdAt: Date.now()
                    });
                    
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
    if (isNaN(expense.amount) || expense.amount < 0) throw new Error("Invalid amount");
    if (expense.note && expense.note.length > 500) throw new Error("Note too long (max 500 characters)");

    if (expense.splitDetails) {
        const { splitType, participants, paidBy } = expense.splitDetails;
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
    if (updates.amount !== undefined && (isNaN(updates.amount) || updates.amount < 0)) throw new Error("Invalid amount");

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
            
            const batch = writeBatch(db);
            snapshot.docs.forEach((docSnap) => {
                batch.delete(docSnap.ref);
            });
            
            await batch.commit();
            
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
    const q = query(expensesRef, orderBy('date', 'desc'));

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

        const batch = writeBatch(db);
        localData.forEach(p => {
            const ref = doc(db, 'wallets', personalWallet!.id, 'expenses', p.id);
            const expenseWithMeta: Expense = {
                ...p,
                walletId: personalWallet!.id,
                createdBy: { uid: user.id, name: user.name }
            };
            batch.set(ref, expenseWithMeta);
        });

        await batch.commit();
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

export const bulkImportExpenses = async (user: User, expenses: Expense[]): Promise<{ imported: number; skipped: number }> => {
  if (user.type === 'guest') {
    saveLocalData(expenses);
    return { imported: expenses.length, skipped: 0 };
  }

  let imported = 0;
  let skipped = 0;

  for (const expense of expenses) {
    try {
      const expenseRef = doc(db, 'wallets', expense.walletId, 'expenses', expense.id);
      const updatedExpense: Expense = {
        ...expense,
        createdBy: { uid: user.id, name: user.name }
      };
      await setDoc(expenseRef, updatedExpense, { merge: true });
      imported++;
    } catch {
      skipped++;
    }
  }

  return { imported, skipped };
};

// Delete a user's entire account and all associated data.
// - Deletes every wallet the user owns or is a member of (and their expenses)
// - Deletes the user's own user document
// Caller is responsible for signing the user out afterwards.
export const deleteAccount = async (user: User): Promise<void> => {
  if (user.type === 'guest') {
    // Guests only store data locally — clear it and return.
    try {
      localStorage.removeItem(GUEST_DATA_KEY);
      localStorage.removeItem(GUEST_CATEGORIES_KEY);
      localStorage.removeItem('kharcha_bachau_guest_v1');
      localStorage.removeItem('kharcha_bachau_active_wallet_id');
    } catch {
      // ignore
    }
    return;
  }

  try {
    const wallets = await getUserWallets(user);

    for (const wallet of wallets) {
      try {
        await deleteWallet(user, wallet.id);
      } catch (error: any) {
        if (import.meta.env.DEV) {
          console.error(`Failed to delete wallet ${wallet.id} during account deletion:`, error);
        }
        // Continue deleting other wallets even if one fails.
      }
    }

    // Delete the user's own document last.
    try {
      await deleteDoc(doc(db, 'users', user.id));
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error('Failed to delete user document:', error);
      }
    }

    if (import.meta.env.DEV) {
      console.log('Account data deletion completed for user:', user.id);
    }
  } catch (error: any) {
    if (import.meta.env.DEV) {
      console.error('Error during account deletion:', error);
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
  const b = localStorage.getItem(MONTHLY_BUDGET_KEY);
  const parsed = b ? parseFloat(b) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 20000;
};

export const saveStoredBudget = async (user: User | null, walletId: string | undefined, amount: number) => {
  localStorage.setItem(MONTHLY_BUDGET_KEY, amount.toString());
  if (user?.type === 'user' && walletId && walletId !== 'guest_wallet') {
    try {
      const walletRef = doc(db, 'wallets', walletId);
      await updateDoc(walletRef, { budget: amount });
    } catch {
      // Firestore write is best-effort; localStorage is the fallback
    }
  }
};
