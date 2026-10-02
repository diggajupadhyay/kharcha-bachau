import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The Firestore rules allow exactly two wallet-write shapes and neither covers
 * both at once, so the order and shape of these writes is load-bearing:
 *
 *   isValidWalletJoin      diff may touch only `members`
 *   memberCanSetOwnProfile diff may touch only `memberProfiles`, and only the
 *                          caller's own key
 *
 * Writing both in one call is rejected, and a join that added the member but
 * lost the name left them as "Someone" in every split picker. These tests pin the
 * sequence so that cannot regress silently.
 */

const updateDoc = vi.fn();
const getDoc = vi.fn();
const arrayUnion = vi.fn((v: unknown) => ({ __arrayUnion: v }));
const arrayRemove = vi.fn((v: unknown) => ({ __arrayRemove: v }));

vi.mock('@react-native-firebase/firestore', () => ({
  getFirestore: () => ({}),
  startAfter: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDoc: (a: unknown, b?: unknown) => getDoc(a, b),
  setDoc: vi.fn(async () => undefined),
  updateDoc: (a: unknown, b: unknown) => updateDoc(a, b),
  deleteDoc: vi.fn(async () => undefined),
  writeBatch: () => ({ set: () => undefined, delete: () => undefined, commit: async () => undefined }),
  collection: (...p: unknown[]) => ({ __path: p }),
  doc: (...p: unknown[]) => ({ __path: p }),
  onSnapshot: () => () => undefined,
  query: (...p: unknown[]) => ({ __q: p }),
  where: (...p: unknown[]) => ({ __w: p }),
  arrayUnion: (a: unknown) => arrayUnion(a),
  arrayRemove: (a: unknown) => arrayRemove(a),
  deleteField: () => ({ __deleteField: true }),
}));

// cloud.ts imports Platform from react-native, which Vitest cannot parse (Flow
// syntax) — only the OS value is actually used, so that is all that is stubbed.
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

vi.mock('@react-native-firebase/app', () => ({ getApps: () => [{}] }));
vi.mock('@react-native-firebase/auth', () => ({
  getAuth: () => ({}), onAuthStateChanged: () => () => undefined,
  signInWithCredential: vi.fn(), signOut: vi.fn(), GoogleAuthProvider: { credential: () => ({}) },
}));
vi.mock('react-native-nitro-google-signin', () => ({ GoogleOneTapSignIn: {} }));

const { joinWalletByCode } = await import('../cloud');
const { generateInviteCode, isValidInviteCode } = await import('../storage');

const USER = { uid: 'uid-new', displayName: 'Sita', email: 'sita@example.com' };

const walletDoc = (over: Record<string, unknown> = {}) => ({
  exists: () => true,
  data: () => ({
    name: 'Trip',
    members: ['uid-owner'],
    memberProfiles: { 'uid-owner': 'Asha' },
    ...over,
  }),
});

beforeEach(() => {
  updateDoc.mockReset();
  getDoc.mockReset();
  updateDoc.mockResolvedValue(undefined);
});

describe('joinWalletByCode', () => {
  it('rejects a malformed code before touching the network', async () => {
    await expect(joinWalletByCode(USER, 'abc')).rejects.toThrow(/not valid/i);
    expect(getDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('rejects a code that does not resolve to a wallet', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false });
    await expect(joinWalletByCode(USER, 'ZZZZZZ')).rejects.toThrow(/not valid/i);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('adds the member and publishes the name as two separate writes', async () => {
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ walletId: 'w1' }) })  // invite
      .mockResolvedValueOnce(walletDoc());

    const result = await joinWalletByCode(USER, 'ABC123');

    expect(result).toEqual({ walletId: 'w1', name: 'Trip', alreadyMember: false });
    expect(updateDoc).toHaveBeenCalledTimes(2);

    // First write: members only.
    expect(Object.keys(updateDoc.mock.calls[0][1])).toEqual(['members']);
    expect(updateDoc.mock.calls[0][1].members).toEqual({ __arrayUnion: 'uid-new' });

    // Second write: memberProfiles only, and the owner is preserved.
    expect(Object.keys(updateDoc.mock.calls[1][1])).toEqual(['memberProfiles']);
    expect(updateDoc.mock.calls[1][1].memberProfiles).toEqual({
      'uid-owner': 'Asha',
      'uid-new': 'Sita',
    });
  });

  it('still publishes the name when the person is already a member', async () => {
    // The regression: an earlier join added the member but lost the name, and the
    // retry reported "already a member" and returned without ever writing it.
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ walletId: 'w1' }) })
      .mockResolvedValueOnce(walletDoc({ members: ['uid-owner', 'uid-new'] }));

    const result = await joinWalletByCode(USER, 'ABC123');

    expect(result.alreadyMember).toBe(true);
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(Object.keys(updateDoc.mock.calls[0][1])).toEqual(['memberProfiles']);
    expect(updateDoc.mock.calls[0][1].memberProfiles['uid-new']).toBe('Sita');
  });

  it('writes nothing when the published name is already correct', async () => {
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ walletId: 'w1' }) })
      .mockResolvedValueOnce(walletDoc({
        members: ['uid-owner', 'uid-new'],
        memberProfiles: { 'uid-owner': 'Asha', 'uid-new': 'Sita' },
      }));

    const result = await joinWalletByCode(USER, 'ABC123');
    expect(result.alreadyMember).toBe(true);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('refreshes a stale published name', async () => {
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ walletId: 'w1' }) })
      .mockResolvedValueOnce(walletDoc({
        members: ['uid-owner', 'uid-new'],
        memberProfiles: { 'uid-owner': 'Asha', 'uid-new': 'old name' },
      }));

    await joinWalletByCode(USER, 'ABC123');
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc.mock.calls[0][1].memberProfiles['uid-new']).toBe('Sita');
  });

  it('turns a rules rejection into a message the user can act on', async () => {
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ walletId: 'w1' }) })
      .mockResolvedValueOnce(walletDoc());
    updateDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    await expect(joinWalletByCode(USER, 'ABC123')).rejects.toThrow(/no longer valid/i);
  });

  it('normalises what a user types', async () => {
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ walletId: 'w1' }) })
      .mockResolvedValueOnce(walletDoc());

    await joinWalletByCode(USER, '  abc123  ');
    // The invite doc is looked up under the normalised, upper-cased code.
    expect(JSON.stringify(getDoc.mock.calls[0][0])).toContain('ABC123');
  });
});

describe('invite code alphabet', () => {
  it('only produces codes the join path accepts', () => {
    for (let i = 0; i < 100; i++) {
      expect(isValidInviteCode(generateInviteCode())).toBe(true);
    }
  });
});
