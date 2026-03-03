/**
 * In-memory token store for anti-cheat session tokens.
 * Tokens are kept in a closure — not accessible via XSS through
 * sessionStorage/localStorage. Tokens survive navigation within
 * the SPA but are cleared on full page reload (acceptable trade-off
 * since rejoining regenerates the token server-side).
 */

const tokens = new Map<string, string>();

export function setActiveToken(sessionId: string, token: string): void {
  tokens.set(`activeToken_${sessionId}`, token);
}

export function getActiveToken(sessionId: string): string {
  return tokens.get(`activeToken_${sessionId}`) || '';
}

