import type { AuthSession } from "./types";

let session: AuthSession | null = null;
const listeners = new Set<(s: AuthSession | null) => void>();

// Internal listener-fire surface. Exported as `_notify` so tests can fire
// listeners without mutating session state.
export function _notify(): void {
  for (const l of listeners) l(session);
}

export function getSession(): AuthSession | null {
  return session;
}

export function signOut(): void {
  session = null;
  try {
    localStorage.removeItem("editor.auth.oauth");
    localStorage.removeItem("editor.auth.pat");
  } catch {
    /* localStorage may not be available */
  }
  _notify();
}

export function subscribe(
  listener: (s: AuthSession | null) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Internal write surface. Production sign-in flows in `oauth.ts` and
// `pat.ts` call `_setSession`; tests use `__resetForTesting` for cleanup
// and `_setSession` to seed a session before assertions.
export function _setSession(s: AuthSession | null): void {
  session = s;
  _notify();
}

// Test-only: clear all state. Production code never imports this.
export function __resetForTesting(): void {
  session = null;
  listeners.clear();
}

import { loadPATSession } from "./pat";
import { loadOAuthSession } from "./oauth";

/** Bootstrap the in-memory session from persisted storage. Called once
 *  from App.tsx at mount. */
export function bootstrap(): void {
  const oauth = loadOAuthSession();
  const pat = loadPATSession();
  session = oauth ?? pat ?? null;
  _notify();
}

export { signInWithPAT } from "./pat";
export { signInWithOAuth } from "./oauth";
