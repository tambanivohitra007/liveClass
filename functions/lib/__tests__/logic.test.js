"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const logic_1 = require("../logic");
(0, vitest_1.describe)('checkCorrectness', () => {
    // --- MCQ (single answer) ---
    (0, vitest_1.it)('returns true for correct MCQ answer', () => {
        const question = { type: 'mcq', options: ['A', 'B', 'C', 'D'], correctAnswers: ['B'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)('B', question)).toBe(true);
    });
    (0, vitest_1.it)('returns false for incorrect MCQ answer', () => {
        const question = { type: 'mcq', options: ['A', 'B', 'C', 'D'], correctAnswers: ['B'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)('A', question)).toBe(false);
    });
    // --- MCQ (multi-answer) ---
    (0, vitest_1.it)('returns true for correct multi-answer MCQ', () => {
        const question = { type: 'mcq', options: ['A', 'B', 'C', 'D'], correctAnswers: ['A', 'C'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)(JSON.stringify(['A', 'C']), question)).toBe(true);
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)(JSON.stringify(['C', 'A']), question)).toBe(true); // order doesn't matter
    });
    (0, vitest_1.it)('returns false for partial multi-answer MCQ', () => {
        const question = { type: 'mcq', options: ['A', 'B', 'C', 'D'], correctAnswers: ['A', 'C'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)(JSON.stringify(['A']), question)).toBe(false);
    });
    (0, vitest_1.it)('returns false for extra selections in multi-answer MCQ', () => {
        const question = { type: 'mcq', options: ['A', 'B', 'C', 'D'], correctAnswers: ['A', 'C'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)(JSON.stringify(['A', 'B', 'C']), question)).toBe(false);
    });
    // --- True/False ---
    (0, vitest_1.it)('returns true for correct TF answer', () => {
        const question = { type: 'tf', options: ['True', 'False'], correctAnswers: ['True'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)('True', question)).toBe(true);
    });
    (0, vitest_1.it)('returns false for incorrect TF answer', () => {
        const question = { type: 'tf', options: ['True', 'False'], correctAnswers: ['True'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)('False', question)).toBe(false);
    });
    // --- Poll ---
    (0, vitest_1.it)('always returns true for poll questions', () => {
        const question = { type: 'poll', options: ['A', 'B', 'C'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)('A', question)).toBe(true);
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)('anything', question)).toBe(true);
    });
    // --- Slide ---
    (0, vitest_1.it)('always returns false for slide questions', () => {
        const question = { type: 'slide' };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)('anything', question)).toBe(false);
    });
    // --- Ordering ---
    (0, vitest_1.it)('returns true for correct ordering', () => {
        const question = { type: 'ordering', options: ['First', 'Second', 'Third'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)(JSON.stringify(['First', 'Second', 'Third']), question)).toBe(true);
    });
    (0, vitest_1.it)('returns false for incorrect ordering', () => {
        const question = { type: 'ordering', options: ['First', 'Second', 'Third'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)(JSON.stringify(['Second', 'First', 'Third']), question)).toBe(false);
    });
    (0, vitest_1.it)('returns false for invalid JSON in ordering', () => {
        const question = { type: 'ordering', options: ['First', 'Second'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)('not json', question)).toBe(false);
    });
    // --- Matching ---
    (0, vitest_1.it)('returns true for correct matching', () => {
        const question = {
            type: 'matching',
            options: ['Cat', 'Dog'],
            matchOptions: ['Meow', 'Bark'],
        };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)(JSON.stringify({ Cat: 'Meow', Dog: 'Bark' }), question)).toBe(true);
    });
    (0, vitest_1.it)('returns false for incorrect matching', () => {
        const question = {
            type: 'matching',
            options: ['Cat', 'Dog'],
            matchOptions: ['Meow', 'Bark'],
        };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)(JSON.stringify({ Cat: 'Bark', Dog: 'Meow' }), question)).toBe(false);
    });
    (0, vitest_1.it)('returns false for invalid JSON in matching', () => {
        const question = { type: 'matching', options: ['Cat'], matchOptions: ['Meow'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)('bad', question)).toBe(false);
    });
    // --- Fill-in-the-blank ---
    (0, vitest_1.it)('returns true for correct fill_blank (case-insensitive)', () => {
        const question = { type: 'fill_blank', correctAnswers: ['mitochondria', 'cell'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)(JSON.stringify(['Mitochondria', 'Cell']), question)).toBe(true);
    });
    (0, vitest_1.it)('returns true for fill_blank with extra whitespace', () => {
        const question = { type: 'fill_blank', correctAnswers: ['answer'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)(JSON.stringify([' answer ']), question)).toBe(true);
    });
    (0, vitest_1.it)('returns false for incorrect fill_blank', () => {
        const question = { type: 'fill_blank', correctAnswers: ['mitochondria'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)(JSON.stringify(['nucleus']), question)).toBe(false);
    });
    (0, vitest_1.it)('returns false for wrong count of fill_blank answers', () => {
        const question = { type: 'fill_blank', correctAnswers: ['a', 'b'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)(JSON.stringify(['a']), question)).toBe(false);
    });
    // --- Code Output ---
    (0, vitest_1.it)('returns true for correct code_output (case-insensitive, trimmed)', () => {
        const question = { type: 'code_output', correctAnswers: ['Hello World'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)('hello world', question)).toBe(true);
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)(' Hello World ', question)).toBe(true);
    });
    (0, vitest_1.it)('returns true when any code_output answer matches', () => {
        const question = { type: 'code_output', correctAnswers: ['42', '42.0'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)('42', question)).toBe(true);
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)('42.0', question)).toBe(true);
    });
    (0, vitest_1.it)('returns false for incorrect code_output', () => {
        const question = { type: 'code_output', correctAnswers: ['Hello'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)('Bye', question)).toBe(false);
    });
    // --- Edge cases ---
    (0, vitest_1.it)('handles missing correctAnswers gracefully', () => {
        const question = { type: 'mcq', options: ['A', 'B'] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)('A', question)).toBe(false);
    });
    (0, vitest_1.it)('handles empty options for matching', () => {
        const question = { type: 'matching', options: [], matchOptions: [] };
        (0, vitest_1.expect)((0, logic_1.checkCorrectness)(JSON.stringify({}), question)).toBe(false);
    });
});
(0, vitest_1.describe)('generatePin', () => {
    (0, vitest_1.it)('generates a 6-digit string', () => {
        const pin = (0, logic_1.generatePin)();
        (0, vitest_1.expect)(pin).toMatch(/^\d{6}$/);
    });
    (0, vitest_1.it)('generates number >= 100000', () => {
        for (let i = 0; i < 100; i++) {
            const pin = parseInt((0, logic_1.generatePin)(), 10);
            (0, vitest_1.expect)(pin).toBeGreaterThanOrEqual(100000);
            (0, vitest_1.expect)(pin).toBeLessThan(1000000);
        }
    });
});
(0, vitest_1.describe)('getShardId', () => {
    (0, vitest_1.it)('returns a value between 0 and numShards-1', () => {
        for (let i = 0; i < 100; i++) {
            const id = `player_${i}`;
            const shard = (0, logic_1.getShardId)(id, 10);
            (0, vitest_1.expect)(shard).toBeGreaterThanOrEqual(0);
            (0, vitest_1.expect)(shard).toBeLessThan(10);
        }
    });
    (0, vitest_1.it)('returns consistent results for the same input', () => {
        const id = 'test-player-abc';
        const shard1 = (0, logic_1.getShardId)(id, 10);
        const shard2 = (0, logic_1.getShardId)(id, 10);
        (0, vitest_1.expect)(shard1).toBe(shard2);
    });
    (0, vitest_1.it)('distributes across shards', () => {
        const shardCounts = new Map();
        for (let i = 0; i < 1000; i++) {
            const shard = (0, logic_1.getShardId)(`player-${i}-${Math.random()}`, 10);
            shardCounts.set(shard, (shardCounts.get(shard) || 0) + 1);
        }
        // Each shard should have at least some players (no empty shards)
        for (let i = 0; i < 10; i++) {
            (0, vitest_1.expect)(shardCounts.get(i) || 0).toBeGreaterThan(0);
        }
    });
    (0, vitest_1.it)('works with custom shard count', () => {
        const shard = (0, logic_1.getShardId)('test', 5);
        (0, vitest_1.expect)(shard).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(shard).toBeLessThan(5);
    });
});
(0, vitest_1.describe)('calculatePoints', () => {
    (0, vitest_1.it)('gives max points for instant answer with no streak', () => {
        const { pointsAwarded } = (0, logic_1.calculatePoints)(20, 0, 0);
        // 1000 * 1.0 + 1 * 50 = 1050
        (0, vitest_1.expect)(pointsAwarded).toBe(1050);
    });
    (0, vitest_1.it)('gives 0 base points when time is up', () => {
        const { pointsAwarded } = (0, logic_1.calculatePoints)(20, 20000, 0);
        // 1000 * 0.0 + 1 * 50 = 50 (streak bonus only)
        (0, vitest_1.expect)(pointsAwarded).toBe(50);
    });
    (0, vitest_1.it)('gives half base points at half time', () => {
        const { pointsAwarded } = (0, logic_1.calculatePoints)(20, 10000, 0);
        // 1000 * 0.5 + 1 * 50 = 550
        (0, vitest_1.expect)(pointsAwarded).toBe(550);
    });
    (0, vitest_1.it)('applies streak bonus correctly', () => {
        const { pointsAwarded: p1 } = (0, logic_1.calculatePoints)(20, 0, 0);
        const { pointsAwarded: p2 } = (0, logic_1.calculatePoints)(20, 0, 2);
        // Streak 0 → newStreak 1: bonus = 50
        // Streak 2 → newStreak 3: bonus = 150
        (0, vitest_1.expect)(p2 - p1).toBe(100); // difference of streak bonus
    });
    (0, vitest_1.it)('increments streak', () => {
        const { newStreak } = (0, logic_1.calculatePoints)(20, 0, 5);
        (0, vitest_1.expect)(newStreak).toBe(6);
    });
    (0, vitest_1.it)('clamps to 0 points when time exceeds limit', () => {
        const { pointsAwarded } = (0, logic_1.calculatePoints)(20, 30000, 0);
        // timeFactor = max(0, negative) = 0, base = 0, streak = 50
        (0, vitest_1.expect)(pointsAwarded).toBe(50);
    });
});
(0, vitest_1.describe)('validateNickname', () => {
    (0, vitest_1.it)('accepts valid nicknames', () => {
        (0, vitest_1.expect)((0, logic_1.validateNickname)('Player1')).toEqual({ valid: true });
        (0, vitest_1.expect)((0, logic_1.validateNickname)('A')).toEqual({ valid: true });
        (0, vitest_1.expect)((0, logic_1.validateNickname)('12345678901234567890')).toEqual({ valid: true }); // exactly 20
    });
    (0, vitest_1.it)('rejects empty nicknames', () => {
        (0, vitest_1.expect)((0, logic_1.validateNickname)('')).toEqual({ valid: false, error: 'Nickname is required' });
        (0, vitest_1.expect)((0, logic_1.validateNickname)('   ')).toEqual({ valid: false, error: 'Nickname is required' });
    });
    (0, vitest_1.it)('rejects nicknames over 20 characters', () => {
        (0, vitest_1.expect)((0, logic_1.validateNickname)('123456789012345678901')).toEqual({ valid: false, error: 'Nickname too long' });
    });
});
//# sourceMappingURL=logic.test.js.map