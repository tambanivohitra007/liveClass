import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit } from '../rateLimit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    // Reset module state by using unique keys per test
  });

  it('allows requests within the limit', () => {
    const key = `test-allow-${Date.now()}`;
    expect(checkRateLimit(key, 3, 10000)).toBe(true);
    expect(checkRateLimit(key, 3, 10000)).toBe(true);
    expect(checkRateLimit(key, 3, 10000)).toBe(true);
  });

  it('blocks requests exceeding the limit', () => {
    const key = `test-block-${Date.now()}`;
    expect(checkRateLimit(key, 2, 10000)).toBe(true);
    expect(checkRateLimit(key, 2, 10000)).toBe(true);
    expect(checkRateLimit(key, 2, 10000)).toBe(false); // 3rd request blocked
  });

  it('allows requests after the window expires', () => {
    const key = `test-expire-${Date.now()}`;
    vi.useFakeTimers();

    expect(checkRateLimit(key, 1, 1000)).toBe(true);
    expect(checkRateLimit(key, 1, 1000)).toBe(false); // blocked

    vi.advanceTimersByTime(1100); // advance past window

    expect(checkRateLimit(key, 1, 1000)).toBe(true); // allowed again

    vi.useRealTimers();
  });

  it('uses separate limits for different keys', () => {
    const key1 = `test-separate1-${Date.now()}`;
    const key2 = `test-separate2-${Date.now()}`;

    expect(checkRateLimit(key1, 1, 10000)).toBe(true);
    expect(checkRateLimit(key1, 1, 10000)).toBe(false); // key1 exhausted
    expect(checkRateLimit(key2, 1, 10000)).toBe(true); // key2 still available
  });

  it('handles high-frequency checks correctly', () => {
    const key = `test-highfreq-${Date.now()}`;
    let allowed = 0;
    for (let i = 0; i < 100; i++) {
      if (checkRateLimit(key, 10, 60000)) allowed++;
    }
    expect(allowed).toBe(10);
  });
});
