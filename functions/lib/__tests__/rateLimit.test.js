"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const rateLimit_1 = require("../rateLimit");
(0, vitest_1.describe)('checkRateLimit', () => {
    (0, vitest_1.beforeEach)(() => {
        // Reset module state by using unique keys per test
    });
    (0, vitest_1.it)('allows requests within the limit', () => {
        const key = `test-allow-${Date.now()}`;
        (0, vitest_1.expect)((0, rateLimit_1.checkRateLimit)(key, 3, 10000)).toBe(true);
        (0, vitest_1.expect)((0, rateLimit_1.checkRateLimit)(key, 3, 10000)).toBe(true);
        (0, vitest_1.expect)((0, rateLimit_1.checkRateLimit)(key, 3, 10000)).toBe(true);
    });
    (0, vitest_1.it)('blocks requests exceeding the limit', () => {
        const key = `test-block-${Date.now()}`;
        (0, vitest_1.expect)((0, rateLimit_1.checkRateLimit)(key, 2, 10000)).toBe(true);
        (0, vitest_1.expect)((0, rateLimit_1.checkRateLimit)(key, 2, 10000)).toBe(true);
        (0, vitest_1.expect)((0, rateLimit_1.checkRateLimit)(key, 2, 10000)).toBe(false); // 3rd request blocked
    });
    (0, vitest_1.it)('allows requests after the window expires', () => {
        const key = `test-expire-${Date.now()}`;
        vitest_1.vi.useFakeTimers();
        (0, vitest_1.expect)((0, rateLimit_1.checkRateLimit)(key, 1, 1000)).toBe(true);
        (0, vitest_1.expect)((0, rateLimit_1.checkRateLimit)(key, 1, 1000)).toBe(false); // blocked
        vitest_1.vi.advanceTimersByTime(1100); // advance past window
        (0, vitest_1.expect)((0, rateLimit_1.checkRateLimit)(key, 1, 1000)).toBe(true); // allowed again
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('uses separate limits for different keys', () => {
        const key1 = `test-separate1-${Date.now()}`;
        const key2 = `test-separate2-${Date.now()}`;
        (0, vitest_1.expect)((0, rateLimit_1.checkRateLimit)(key1, 1, 10000)).toBe(true);
        (0, vitest_1.expect)((0, rateLimit_1.checkRateLimit)(key1, 1, 10000)).toBe(false); // key1 exhausted
        (0, vitest_1.expect)((0, rateLimit_1.checkRateLimit)(key2, 1, 10000)).toBe(true); // key2 still available
    });
    (0, vitest_1.it)('handles high-frequency checks correctly', () => {
        const key = `test-highfreq-${Date.now()}`;
        let allowed = 0;
        for (let i = 0; i < 100; i++) {
            if ((0, rateLimit_1.checkRateLimit)(key, 10, 60000))
                allowed++;
        }
        (0, vitest_1.expect)(allowed).toBe(10);
    });
});
//# sourceMappingURL=rateLimit.test.js.map