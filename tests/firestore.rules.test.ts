import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { describe, beforeAll, afterAll, beforeEach, it } from 'vitest';
import { doc, getDoc, setDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'test-rules',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('Users collection', () => {
  it('allows a user to read their own profile', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/user1'), { displayName: 'Test' });
    });
    await assertSucceeds(getDoc(doc(db, 'users/user1')));
  });

  it('denies a user from reading another profile', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/user2'), { displayName: 'Other' });
    });
    await assertFails(getDoc(doc(db, 'users/user2')));
  });

  it('denies unauthenticated access', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users/user1')));
  });

  it('allows a user to write their own profile', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/user1'), { displayName: 'Updated' }));
  });

  it('denies writing to another user profile', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertFails(setDoc(doc(db, 'users/user2'), { displayName: 'Hacked' }));
  });
});

describe('Quizzes collection', () => {
  it('allows authenticated users to read quizzes', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'quizzes/quiz1'), { ownerId: 'user2', title: 'Test' });
    });
    await assertSucceeds(getDoc(doc(db, 'quizzes/quiz1')));
  });

  it('denies unauthenticated quiz reads', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'quizzes/quiz1'), { ownerId: 'user1', title: 'Test' });
    });
    await assertFails(getDoc(doc(db, 'quizzes/quiz1')));
  });

  it('allows authenticated users to create quizzes', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(addDoc(collection(db, 'quizzes'), { ownerId: 'user1', title: 'New Quiz' }));
  });

  it('allows owner to update their quiz', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'quizzes/quiz1'), { ownerId: 'user1', title: 'Original' });
    });
    await assertSucceeds(setDoc(doc(db, 'quizzes/quiz1'), { ownerId: 'user1', title: 'Updated' }));
  });

  it('denies non-owner from updating a quiz', async () => {
    const db = testEnv.authenticatedContext('user2').firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'quizzes/quiz1'), { ownerId: 'user1', title: 'Original' });
    });
    await assertFails(setDoc(doc(db, 'quizzes/quiz1'), { ownerId: 'user1', title: 'Hacked' }));
  });

  it('allows owner to delete their quiz', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'quizzes/quiz1'), { ownerId: 'user1', title: 'ToDelete' });
    });
    await assertSucceeds(deleteDoc(doc(db, 'quizzes/quiz1')));
  });

  it('denies non-owner from deleting a quiz', async () => {
    const db = testEnv.authenticatedContext('user2').firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'quizzes/quiz1'), { ownerId: 'user1', title: 'Protected' });
    });
    await assertFails(deleteDoc(doc(db, 'quizzes/quiz1')));
  });
});

describe('Sessions collection', () => {
  it('allows anyone to read sessions', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions/s1'), { hostId: 'host1', pinCode: '123456' });
    });
    await assertSucceeds(getDoc(doc(db, 'sessions/s1')));
  });

  it('allows host to update session', async () => {
    const db = testEnv.authenticatedContext('host1').firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions/s1'), { hostId: 'host1', status: 'lobby' });
    });
    await assertSucceeds(setDoc(doc(db, 'sessions/s1'), { hostId: 'host1', status: 'live' }));
  });

  it('denies non-host from updating session', async () => {
    const db = testEnv.authenticatedContext('attacker').firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions/s1'), { hostId: 'host1', status: 'lobby' });
    });
    await assertFails(setDoc(doc(db, 'sessions/s1'), { hostId: 'host1', status: 'ended' }));
  });
});

describe('Session subcollections', () => {
  it('allows anyone to read players', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions/s1/players/p1'), { nickname: 'Alice' });
    });
    await assertSucceeds(getDoc(doc(db, 'sessions/s1/players/p1')));
  });

  it('allows anyone to create a player (join)', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions/s1'), { hostId: 'host1' });
    });
    await assertSucceeds(setDoc(doc(db, 'sessions/s1/players/p1'), { nickname: 'Bob' }));
  });

  it('denies client writes to answers (Cloud Functions only)', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions/s1'), { hostId: 'host1' });
    });
    await assertFails(setDoc(doc(db, 'sessions/s1/answers/a1'), { selection: 'A' }));
  });

  it('denies client writes to leaderboard shards', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions/s1'), { hostId: 'host1' });
    });
    await assertFails(setDoc(doc(db, 'sessions/s1/leaderboard_shards/0'), { players: {} }));
  });

  it('denies client writes to analytics', async () => {
    const db = testEnv.authenticatedContext('host1').firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions/s1'), { hostId: 'host1' });
    });
    await assertFails(setDoc(doc(db, 'sessions/s1/analytics/q1'), { totalAnswers: 99 }));
  });

  it('allows reading leaderboard shards', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions/s1'), { hostId: 'host1' });
      await setDoc(doc(ctx.firestore(), 'sessions/s1/leaderboard_shards/0'), { players: {} });
    });
    await assertSucceeds(getDoc(doc(db, 'sessions/s1/leaderboard_shards/0')));
  });

  it('allows reading analytics', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sessions/s1'), { hostId: 'host1' });
      await setDoc(doc(ctx.firestore(), 'sessions/s1/analytics/q1'), { totalAnswers: 5 });
    });
    await assertSucceeds(getDoc(doc(db, 'sessions/s1/analytics/q1')));
  });
});

describe('Assignments collection', () => {
  it('allows authenticated read', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'assignments/a1'), { quizId: 'q1', ownerId: 'user1' });
    });
    await assertSucceeds(getDoc(doc(db, 'assignments/a1')));
  });

  it('denies unauthenticated read', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'assignments/a1'), { quizId: 'q1' });
    });
    await assertFails(getDoc(doc(db, 'assignments/a1')));
  });

  it('allows authenticated write', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(addDoc(collection(db, 'assignments'), { quizId: 'q1', ownerId: 'user1' }));
  });
});
