import { describe, it, expect } from 'vitest';
import { checkCorrectness, generatePin, getShardId, calculatePoints, validateNickname } from '../logic';

describe('checkCorrectness', () => {
  // --- MCQ (single answer) ---
  it('returns true for correct MCQ answer', () => {
    const question = { type: 'mcq', options: ['A', 'B', 'C', 'D'], correctAnswers: ['B'] };
    expect(checkCorrectness('B', question)).toBe(true);
  });

  it('returns false for incorrect MCQ answer', () => {
    const question = { type: 'mcq', options: ['A', 'B', 'C', 'D'], correctAnswers: ['B'] };
    expect(checkCorrectness('A', question)).toBe(false);
  });

  // --- MCQ (multi-answer) ---
  it('returns true for correct multi-answer MCQ', () => {
    const question = { type: 'mcq', options: ['A', 'B', 'C', 'D'], correctAnswers: ['A', 'C'] };
    expect(checkCorrectness(JSON.stringify(['A', 'C']), question)).toBe(true);
    expect(checkCorrectness(JSON.stringify(['C', 'A']), question)).toBe(true); // order doesn't matter
  });

  it('returns false for partial multi-answer MCQ', () => {
    const question = { type: 'mcq', options: ['A', 'B', 'C', 'D'], correctAnswers: ['A', 'C'] };
    expect(checkCorrectness(JSON.stringify(['A']), question)).toBe(false);
  });

  it('returns false for extra selections in multi-answer MCQ', () => {
    const question = { type: 'mcq', options: ['A', 'B', 'C', 'D'], correctAnswers: ['A', 'C'] };
    expect(checkCorrectness(JSON.stringify(['A', 'B', 'C']), question)).toBe(false);
  });

  // --- True/False ---
  it('returns true for correct TF answer', () => {
    const question = { type: 'tf', options: ['True', 'False'], correctAnswers: ['True'] };
    expect(checkCorrectness('True', question)).toBe(true);
  });

  it('returns false for incorrect TF answer', () => {
    const question = { type: 'tf', options: ['True', 'False'], correctAnswers: ['True'] };
    expect(checkCorrectness('False', question)).toBe(false);
  });

  // --- Poll ---
  it('always returns true for poll questions', () => {
    const question = { type: 'poll', options: ['A', 'B', 'C'] };
    expect(checkCorrectness('A', question)).toBe(true);
    expect(checkCorrectness('anything', question)).toBe(true);
  });

  // --- Slide ---
  it('always returns false for slide questions', () => {
    const question = { type: 'slide' };
    expect(checkCorrectness('anything', question)).toBe(false);
  });

  // --- Ordering ---
  it('returns true for correct ordering', () => {
    const question = { type: 'ordering', options: ['First', 'Second', 'Third'] };
    expect(checkCorrectness(JSON.stringify(['First', 'Second', 'Third']), question)).toBe(true);
  });

  it('returns false for incorrect ordering', () => {
    const question = { type: 'ordering', options: ['First', 'Second', 'Third'] };
    expect(checkCorrectness(JSON.stringify(['Second', 'First', 'Third']), question)).toBe(false);
  });

  it('returns false for invalid JSON in ordering', () => {
    const question = { type: 'ordering', options: ['First', 'Second'] };
    expect(checkCorrectness('not json', question)).toBe(false);
  });

  // --- Matching ---
  it('returns true for correct matching', () => {
    const question = {
      type: 'matching',
      options: ['Cat', 'Dog'],
      matchOptions: ['Meow', 'Bark'],
    };
    expect(checkCorrectness(JSON.stringify({ Cat: 'Meow', Dog: 'Bark' }), question)).toBe(true);
  });

  it('returns false for incorrect matching', () => {
    const question = {
      type: 'matching',
      options: ['Cat', 'Dog'],
      matchOptions: ['Meow', 'Bark'],
    };
    expect(checkCorrectness(JSON.stringify({ Cat: 'Bark', Dog: 'Meow' }), question)).toBe(false);
  });

  it('returns false for invalid JSON in matching', () => {
    const question = { type: 'matching', options: ['Cat'], matchOptions: ['Meow'] };
    expect(checkCorrectness('bad', question)).toBe(false);
  });

  // --- Fill-in-the-blank ---
  it('returns true for correct fill_blank (case-insensitive)', () => {
    const question = { type: 'fill_blank', correctAnswers: ['mitochondria', 'cell'] };
    expect(checkCorrectness(JSON.stringify(['Mitochondria', 'Cell']), question)).toBe(true);
  });

  it('returns true for fill_blank with extra whitespace', () => {
    const question = { type: 'fill_blank', correctAnswers: ['answer'] };
    expect(checkCorrectness(JSON.stringify([' answer ']), question)).toBe(true);
  });

  it('returns false for incorrect fill_blank', () => {
    const question = { type: 'fill_blank', correctAnswers: ['mitochondria'] };
    expect(checkCorrectness(JSON.stringify(['nucleus']), question)).toBe(false);
  });

  it('returns false for wrong count of fill_blank answers', () => {
    const question = { type: 'fill_blank', correctAnswers: ['a', 'b'] };
    expect(checkCorrectness(JSON.stringify(['a']), question)).toBe(false);
  });

  // --- Code Output ---
  it('returns true for correct code_output (case-insensitive, trimmed)', () => {
    const question = { type: 'code_output', correctAnswers: ['Hello World'] };
    expect(checkCorrectness('hello world', question)).toBe(true);
    expect(checkCorrectness(' Hello World ', question)).toBe(true);
  });

  it('returns true when any code_output answer matches', () => {
    const question = { type: 'code_output', correctAnswers: ['42', '42.0'] };
    expect(checkCorrectness('42', question)).toBe(true);
    expect(checkCorrectness('42.0', question)).toBe(true);
  });

  it('returns false for incorrect code_output', () => {
    const question = { type: 'code_output', correctAnswers: ['Hello'] };
    expect(checkCorrectness('Bye', question)).toBe(false);
  });

  // --- Edge cases ---
  it('handles missing correctAnswers gracefully', () => {
    const question = { type: 'mcq', options: ['A', 'B'] };
    expect(checkCorrectness('A', question)).toBe(false);
  });

  it('handles empty options for matching', () => {
    const question = { type: 'matching', options: [], matchOptions: [] };
    expect(checkCorrectness(JSON.stringify({}), question)).toBe(false);
  });
});

describe('generatePin', () => {
  it('generates a 6-digit string', () => {
    const pin = generatePin();
    expect(pin).toMatch(/^\d{6}$/);
  });

  it('generates number >= 100000', () => {
    for (let i = 0; i < 100; i++) {
      const pin = parseInt(generatePin(), 10);
      expect(pin).toBeGreaterThanOrEqual(100000);
      expect(pin).toBeLessThan(1000000);
    }
  });
});

describe('getShardId', () => {
  it('returns a value between 0 and numShards-1', () => {
    for (let i = 0; i < 100; i++) {
      const id = `player_${i}`;
      const shard = getShardId(id, 10);
      expect(shard).toBeGreaterThanOrEqual(0);
      expect(shard).toBeLessThan(10);
    }
  });

  it('returns consistent results for the same input', () => {
    const id = 'test-player-abc';
    const shard1 = getShardId(id, 10);
    const shard2 = getShardId(id, 10);
    expect(shard1).toBe(shard2);
  });

  it('distributes across shards', () => {
    const shardCounts = new Map<number, number>();
    for (let i = 0; i < 1000; i++) {
      const shard = getShardId(`player-${i}-${Math.random()}`, 10);
      shardCounts.set(shard, (shardCounts.get(shard) || 0) + 1);
    }
    // Each shard should have at least some players (no empty shards)
    for (let i = 0; i < 10; i++) {
      expect(shardCounts.get(i) || 0).toBeGreaterThan(0);
    }
  });

  it('works with custom shard count', () => {
    const shard = getShardId('test', 5);
    expect(shard).toBeGreaterThanOrEqual(0);
    expect(shard).toBeLessThan(5);
  });
});

describe('calculatePoints', () => {
  it('gives max points for instant answer with no streak', () => {
    const { pointsAwarded } = calculatePoints(20, 0, 0);
    // 1000 * 1.0 + 1 * 50 = 1050
    expect(pointsAwarded).toBe(1050);
  });

  it('gives 0 base points when time is up', () => {
    const { pointsAwarded } = calculatePoints(20, 20000, 0);
    // 1000 * 0.0 + 1 * 50 = 50 (streak bonus only)
    expect(pointsAwarded).toBe(50);
  });

  it('gives half base points at half time', () => {
    const { pointsAwarded } = calculatePoints(20, 10000, 0);
    // 1000 * 0.5 + 1 * 50 = 550
    expect(pointsAwarded).toBe(550);
  });

  it('applies streak bonus correctly', () => {
    const { pointsAwarded: p1 } = calculatePoints(20, 0, 0);
    const { pointsAwarded: p2 } = calculatePoints(20, 0, 2);
    // Streak 0 → newStreak 1: bonus = 50
    // Streak 2 → newStreak 3: bonus = 150
    expect(p2 - p1).toBe(100); // difference of streak bonus
  });

  it('increments streak', () => {
    const { newStreak } = calculatePoints(20, 0, 5);
    expect(newStreak).toBe(6);
  });

  it('clamps to 0 points when time exceeds limit', () => {
    const { pointsAwarded } = calculatePoints(20, 30000, 0);
    // timeFactor = max(0, negative) = 0, base = 0, streak = 50
    expect(pointsAwarded).toBe(50);
  });
});

describe('validateNickname', () => {
  it('accepts valid nicknames', () => {
    expect(validateNickname('Player1')).toEqual({ valid: true });
    expect(validateNickname('A')).toEqual({ valid: true });
    expect(validateNickname('12345678901234567890')).toEqual({ valid: true }); // exactly 20
  });

  it('rejects empty nicknames', () => {
    expect(validateNickname('')).toEqual({ valid: false, error: 'Nickname is required' });
    expect(validateNickname('   ')).toEqual({ valid: false, error: 'Nickname is required' });
  });

  it('rejects nicknames over 20 characters', () => {
    expect(validateNickname('123456789012345678901')).toEqual({ valid: false, error: 'Nickname too long' });
  });
});
