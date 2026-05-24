import type { AuthSession } from "./types";

let session: AuthSession | null = null;
const listeners = new Set<(s: AuthSession | null) => void>();

function notify(): void {
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
  notify();
}

export function subscribe(
  listener: (s: AuthSession | null) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Test-only escape hatches. Production code never imports these.
export function __setSessionForTesting(s: AuthSession | null): void {
  session = s;
  notify();
}

export function __resetForTesting(): void {
  session = null;
  listeners.clear();
}

import { loadPATSession } from "./pat";
// OAuth load goes here too in Task B3.

/** Bootstrap the in-memory session from persisted storage. Called once
 *  from App.tsx at mount. */
export function bootstrap(): void {
  const oauth = null; // wired in Task B3
  const pat = loadPATSession();
  session = oauth ?? pat ?? null;
  notify();
}

export { signInWithPAT } from "./pat";
