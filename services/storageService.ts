
import { db } from './firebase';
import { User, Expense, Wallet, Category } from '../types';
import { format } from 'date-fns';
import firebase from 'firebase/compat/app';

const GUEST_DATA_KEY = 'daily_expenses_guest_v1';
const MONTHLY_BUDGET_KEY = 'daily_expenses_budget_monthly';
const GUEST_CATEGORIES_KEY = 'kharcha_bachau_custom_categories_guest';

// --- Wallet Management ---

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
    
    try {
        const newWalletRef = db.collection('wallets').doc();
        const newWallet: Wallet = {
            id: newWalletRef.id,
            name: walletName,
            ownerId: user.id,
            members: [user.id],
            currency: 'Rs.',
            createdAt: Date.now(),
            isPersonal: isPersonal
        };
        
        await newWalletRef.set(newWallet);
        
        if (import.meta.env.DEV) {
            console.log('Wallet created successfully:', newWalletRef.id, isPersonal ? '(personal)' : '(shared)');
        }
        
        return newWalletRef.id;
    } catch (error: any) {
        if (import.meta.env.DEV) {
            console.error('Error creating wallet:', error);
        }
        
        // Provide user-friendly error messages
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
        const snapshot = await db.collection('wallets')
            .where('members', 'array-contains', user.id)
            .get();
        
        const wallets = snapshot.docs.map(doc => doc.data() as Wallet);
        
        if (import.meta.env.DEV) {
            console.log('Fetched wallets:', wallets.length);
        }
        
        return wallets;
    } catch (error: any) {
        if (import.meta.env.DEV) {
            console.error("Error fetching wallets:", error.code, error.message);
        }
        
        // Return empty array on error to prevent app crash
        // The UI should handle empty wallets gracefully
        return [];
    }
};

export const leaveWallet = async (user: User, walletId: string) => {
    if (user.type === 'guest') return;
    
    try {
        await db.collection('wallets').doc(walletId).update({
            members: firebase.firestore.FieldValue.arrayRemove(user.id)
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
        // 1. Delete all expenses in subcollection (Batched)
        const expensesRef = db.collection('wallets').doc(walletId).collection('expenses');
        const snapshot = await expensesRef.get();
        
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        
        // 2. Delete the wallet itself
        const walletRef = db.collection('wallets').doc(walletId);
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

// --- Wallet Merge & Cleanup ---

/**
 * Merge expenses from source wallet into target wallet
 * Handles duplicate expense IDs by keeping the target wallet's version
 * @param user - The user performing the merge
 * @param sourceWalletId - Wallet to merge from (will be deleted after merge)
 * @param targetWalletId - Wallet to merge into (kept)
 */
export const mergeWallets = async (user: User, sourceWalletId: string, targetWalletId: string): Promise<void> => {
    if (user.type === 'guest') throw new Error("Guests cannot merge wallets");
    if (sourceWalletId === targetWalletId) throw new Error("Cannot merge wallet into itself");
    
    try {
        // Get all expenses from source wallet
        const sourceExpensesRef = db.collection('wallets').doc(sourceWalletId).collection('expenses');
        const sourceSnapshot = await sourceExpensesRef.get();
        
        if (sourceSnapshot.empty) {
            if (import.meta.env.DEV) {
                console.log('Source wallet is empty, deleting empty wallet');
            }
            // Delete empty source wallet
            const sourceWalletRef = db.collection('wallets').doc(sourceWalletId);
            await sourceWalletRef.delete();
            return;
        }

        // Get existing expenses from target wallet to check for duplicates
        const targetExpensesRef = db.collection('wallets').doc(targetWalletId).collection('expenses');
        const targetSnapshot = await targetExpensesRef.get();
        const existingExpenseIds = new Set(targetSnapshot.docs.map(doc => doc.id));

        // Batch merge expenses
        const batch = db.batch();
        let mergedCount = 0;
        let skippedCount = 0;

        sourceSnapshot.docs.forEach((doc) => {
            const expense = doc.data() as Expense;
            
            // Check if expense with same ID already exists in target
            if (existingExpenseIds.has(expense.id)) {
                // Skip duplicate - keep target wallet's version
                skippedCount++;
                if (import.meta.env.DEV) {
                    console.log(`Skipping duplicate expense: ${expense.id}`);
                }
            } else {
                // Copy expense to target wallet with updated walletId
                const newExpenseRef = targetExpensesRef.doc(expense.id);
                const mergedExpense: Expense = {
                    ...expense,
                    walletId: targetWalletId,
                    // Update createdBy to current user to comply with Firestore rules
                    // Rules require createdBy.uid == request.auth.uid for expense creation
                    createdBy: {
                        uid: user.id,
                        name: user.name
                    }
                    // Preserve original createdAt for historical accuracy
                };
                batch.set(newExpenseRef, mergedExpense);
                mergedCount++;
            }
        });

        await batch.commit();

        // Delete source wallet and its expenses
        // We delete expenses first, then the wallet document
        const deleteBatch = db.batch();
        
        // Delete all remaining expenses from source wallet
        const remainingExpensesSnapshot = await sourceExpensesRef.get();
        remainingExpensesSnapshot.docs.forEach((doc) => {
            deleteBatch.delete(doc.ref);
        });
        
        // Delete the source wallet document
        const sourceWalletRef = db.collection('wallets').doc(sourceWalletId);
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

/**
 * Cleanup duplicate personal wallets by merging them into one
 * Keeps the wallet with the most expenses, or the oldest one if equal
 * @param user - The user whose wallets to clean up
 * @returns The remaining personal wallet ID, or null if none existed
 */
export const cleanupDuplicatePersonalWallets = async (user: User): Promise<string | null> => {
    if (user.type === 'guest') return null;
    
    try {
        const allWallets = await getUserWallets(user);
        const personalWallets = allWallets.filter(w => w.isPersonal === true);
        
        // No duplicates, nothing to clean up
        if (personalWallets.length <= 1) {
            return personalWallets.length === 1 ? personalWallets[0].id : null;
        }

        if (import.meta.env.DEV) {
            console.log(`Found ${personalWallets.length} personal wallets, cleaning up duplicates...`);
        }

        // Get expense counts for each personal wallet to determine which to keep
        const walletExpenseCounts = await Promise.all(
            personalWallets.map(async (wallet) => {
                const expensesRef = db.collection('wallets').doc(wallet.id).collection('expenses');
                const snapshot = await expensesRef.get();
                return {
                    wallet,
                    expenseCount: snapshot.size,
                    snapshot
                };
            })
        );

        // Sort by expense count (descending), then by creation date (oldest first) if equal
        walletExpenseCounts.sort((a, b) => {
            if (b.expenseCount !== a.expenseCount) {
                return b.expenseCount - a.expenseCount; // Most expenses first
            }
            return a.wallet.createdAt - b.wallet.createdAt; // Oldest first
        });

        // Target wallet is the one with most expenses (or oldest if equal)
        const targetWallet = walletExpenseCounts[0].wallet;
        const walletsToMerge = walletExpenseCounts.slice(1);

        // Merge all duplicate wallets into target
        for (const { wallet } of walletsToMerge) {
            try {
                await mergeWallets(user, wallet.id, targetWallet.id);
                if (import.meta.env.DEV) {
                    console.log(`Merged wallet ${wallet.id} into ${targetWallet.id}`);
                }
            } catch (error: any) {
                // Log error but continue with other merges
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
        // Don't throw - allow app to continue even if cleanup fails
        return null;
    }
};

// --- Invite System ---

export const getOrGenerateInviteCode = async (walletId: string): Promise<string> => {
    try {
        // Check if code exists for this wallet
        const existing = await db.collection('invites').where('walletId', '==', walletId).limit(1).get();
        if (!existing.empty) {
            return existing.docs[0].id;
        }

        // Generate new unique 6-digit code with retry logic to handle collisions
        const maxRetries = 5;
        let attempts = 0;
        
        while (attempts < maxRetries) {
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();
            
            // Check if code already exists
            const codeDoc = await db.collection('invites').doc(code).get();
            
            if (!codeDoc.exists) {
                // Code doesn't exist, safe to use
                try {
                    await db.collection('invites').doc(code).set({
                        walletId,
                        createdAt: Date.now()
                    });
                    
                    if (import.meta.env.DEV) {
                        console.log('Invite code generated:', code);
                    }
                    
                    return code;
                } catch (error: any) {
                    // If set fails (e.g., due to race condition), retry
                    if (error.code === 'permission-denied' || error.code === 'already-exists') {
                        attempts++;
                        continue;
                    }
                    throw error;
                }
            } else {
                // Code exists, try again
                attempts++;
                if (import.meta.env.DEV) {
                    console.warn(`Invite code collision detected, retrying... (attempt ${attempts}/${maxRetries})`);
                }
            }
        }
        
        // If we've exhausted retries, throw error
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
        const inviteDoc = await db.collection('invites').doc(code.toUpperCase()).get();
        if (!inviteDoc.exists) {
            throw new Error("Invalid invite code");
        }

        const walletId = inviteDoc.data()?.walletId;
        if (!walletId) {
            throw new Error("Invalid invite data");
        }

        // Add user to wallet members
        await db.collection('wallets').doc(walletId).update({
            members: firebase.firestore.FieldValue.arrayUnion(user.id)
        });
        
        if (import.meta.env.DEV) {
            console.log('Joined wallet successfully:', walletId);
        }

        return walletId;
    } catch (error: any) {
        if (import.meta.env.DEV) {
            console.error('Error joining wallet:', error);
        }
        
        // Re-throw user-friendly errors
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

// --- Expense Management ---

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

export const addExpense = async (user: User, activeWalletId: string, expense: Omit<Expense, 'id' | 'createdAt' | 'walletId' | 'createdBy'>) => {
    if (isNaN(expense.amount) || expense.amount < 0) throw new Error("Invalid amount");

    // Validate split details if provided
    if (expense.splitDetails) {
        const { splitType, participants, paidBy } = expense.splitDetails;
        if (!paidBy || !participants || participants.length === 0) {
            throw new Error("Invalid split details");
        }
        
        // Validate split amounts add up
        const totalSplit = participants.reduce((sum, p) => sum + p.amount, 0);
        const tolerance = 0.01; // Allow small rounding differences
        if (Math.abs(totalSplit - expense.amount) > tolerance) {
            throw new Error(`Split amounts (${totalSplit}) don't match total (${expense.amount})`);
        }
    }

    // Build expense object, omitting splitDetails if undefined
    const expenseData: any = {
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
    
    // Only include splitDetails if it's actually defined
    if (expense.splitDetails) {
        expenseData.splitDetails = expense.splitDetails;
    }
    
    const newExpense: Expense = expenseData;

    if (user.type === 'guest') {
        const current = getLocalData();
        await new Promise(r => setTimeout(r, 10)); // UX delay
        saveLocalData([...current, newExpense]);
        
        if (import.meta.env.DEV) {
            console.log('Expense saved locally (guest mode)');
        }
    } else {
        try {
            await db.collection('wallets').doc(activeWalletId)
                .collection('expenses').doc(newExpense.id)
                .set(newExpense);
            
            if (import.meta.env.DEV) {
                console.log('Expense saved to Firestore:', newExpense.id);
            }
        } catch (error: any) {
            if (import.meta.env.DEV) {
                // Log detailed error information (only in development)
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
                // Include the actual error message for debugging
                throw new Error(`Failed to save expense: ${error.message}`);
            }
            
            throw new Error('Failed to save expense. Please try again.');
        }
    }
};

export const updateExpense = async (user: User, activeWalletId: string, expenseId: string, updates: Partial<Expense>) => {
    if (updates.amount !== undefined && (isNaN(updates.amount) || updates.amount < 0)) throw new Error("Invalid amount");

    // Filter updates to only allow fields permitted by Firestore rules: amount, note, splitDetails
    const allowedUpdates: Partial<Expense> = {};
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
            await db.collection('wallets').doc(activeWalletId)
                .collection('expenses').doc(expenseId)
                .update(allowedUpdates);
            
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

// --- Custom Categories Management ---

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
            const userDoc = await db.collection('users').doc(user.id).get();
            if (userDoc.exists) {
                const data = userDoc.data();
                return data?.customCategories || [];
            } else {
                // Create user document if it doesn't exist
                await db.collection('users').doc(user.id).set({
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
            const userDoc = await db.collection('users').doc(user.id).get();
            if (userDoc.exists) {
                await db.collection('users').doc(user.id).update({
                    customCategories: categories
                });
            } else {
                // Create user document if it doesn't exist
                await db.collection('users').doc(user.id).set({
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
            await db.collection('wallets').doc(activeWalletId)
                .collection('expenses').doc(expenseId)
                .delete();
            
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

export const clearAllExpenses = async (user: User, walletId: string) => {
    if (user.type === 'guest') {
        saveLocalData([]);
        
        if (import.meta.env.DEV) {
            console.log('All expenses cleared locally (guest mode)');
        }
    } else {
        try {
            const expensesRef = db.collection('wallets').doc(walletId).collection('expenses');
            const snapshot = await expensesRef.get();
            
            const batch = db.batch();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
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

export const subscribeToWalletExpenses = (walletId: string, callback: (e: Expense[]) => void) => {
    return db.collection('wallets').doc(walletId)
      .collection('expenses')
      .orderBy('date', 'desc')
      .limit(500)
      .onSnapshot(
        snapshot => {
          const expenses = snapshot.docs.map(doc => doc.data() as Expense);
          
          if (import.meta.env.DEV) {
              console.log('Expenses updated from Firestore:', expenses.length);
          }
          
          callback(expenses);
        }, 
        (error) => {
          if (import.meta.env.DEV) {
              console.error("Firestore subscription error:", error.code, error.message);
          }
          
          // If index is missing, provide helpful error
          if (error.code === 'failed-precondition' && import.meta.env.DEV) {
              console.error('Firestore index required. Please deploy indexes: npm run deploy:indexes');
          }
          
          // Call callback with empty array on error to prevent UI crash
          callback([]);
        }
      );
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
        // Check if user already has a personal wallet
        const existingWallets = await getUserWallets(user);
        let personalWallet = existingWallets.find(w => w.isPersonal === true);
        
        // If no personal wallet exists, create one
        if (!personalWallet) {
            const personalWalletRef = db.collection('wallets').doc();
            const newPersonalWallet: Wallet = {
                id: personalWalletRef.id,
                name: 'Personal Wallet',
                ownerId: user.id,
                members: [user.id],
                currency: 'Rs.',
                createdAt: Date.now(),
                isPersonal: true
            };
            await personalWalletRef.set(newPersonalWallet);
            personalWallet = newPersonalWallet;
        }

        // Sync guest expenses to the personal wallet
        const batch = db.batch();
        localData.forEach(p => {
            const ref = db.collection('wallets').doc(personalWallet!.id).collection('expenses').doc(p.id);
            // Remove type field if it exists (for backwards compatibility with old guest data)
            const { type, ...expenseWithoutType } = p as any;
            const expenseWithMeta: Expense = {
                ...expenseWithoutType,
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

        // Cleanup any duplicate personal wallets after syncing
        await cleanupDuplicatePersonalWallets(user);
    } catch (error: any) {
        if (import.meta.env.DEV) {
            console.error('Error syncing guest data:', error);
        }
        
        // Don't throw - allow user to continue even if sync fails
        // Data remains in localStorage and can be synced later
        throw new Error('Failed to sync guest data. Your data is still saved locally.');
    }
};

export const getStoredBudget = (): number => {
    const b = localStorage.getItem(MONTHLY_BUDGET_KEY);
    return b ? parseFloat(b) : 20000;
};

export const saveStoredBudget = (amount: number) => {
    localStorage.setItem(MONTHLY_BUDGET_KEY, amount.toString());
};