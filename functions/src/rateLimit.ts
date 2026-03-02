/**
 * In-memory sliding window rate limiter for Cloud Functions.
 * Works per warm instance — not globally distributed, but effective
 * at limiting per-instance request floods.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const buckets = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, entry] of buckets) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) {
      buckets.delete(key);
    }
  }
}

/**
 * Check if a request should be rate limited.
 * @param key - Unique identifier (e.g., IP, sessionId, playerId)
 * @param maxRequests - Max requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns true if the request is allowed, false if rate limited
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  cleanup(windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = buckets.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    buckets.set(key, entry);
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    return false; // Rate limited
  }

  entry.timestamps.push(now);
  return true; // Allowed
}

/** Pre-configured rate limits for different function types */
export const RATE_LIMITS = {
  /** Join session: 5 attempts per 10 seconds per IP/session combo */
  joinSession: { maxRequests: 5, windowMs: 10_000 },
  /** Score answer: 2 per second per player (one answer per question max) */
  scoreAnswer: { maxRequests: 2, windowMs: 1_000 },
  /** General API calls: 30 per minute */
  general: { maxRequests: 30, windowMs: 60_000 },
  /** AI generation: 5 per minute */
  aiGenerate: { maxRequests: 5, windowMs: 60_000 },
} as const;
