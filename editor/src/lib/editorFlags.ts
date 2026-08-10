/**
 * The rich (WYSIWYG) body editor is the DEFAULT surface; this flag is an
 * opt-OUT.
 *
 * Turn it off via the Sidebar toggle (persisted to localStorage), or manually:
 *   localStorage.setItem("editor.wysiwyg", "0")
 *
 * Being on by default is only safe because it is not the only gate:
 * `shouldUseWysiwyg` (lib/wysiwygPaths.ts) intersects this flag with the
 * CI-derived rich-safe set, so a file whose Milkdown round-trip is not proven
 * still opens in the source pane no matter what this returns.
 *
 * Storage shape: "0" means the author opted out, "1" means they opted in
 * (or enabled the old alpha), and an ABSENT key means they have not chosen —
 * which is now on. That is why turning it off has to WRITE "0" rather than
 * remove the key: a removed key is indistinguishable from never having chosen,
 * so the opt-out would not survive a reload.
 *
 * sessionStorage is still read for back-compat with anyone who set the key via
 * devtools before it was persisted to localStorage.
 */
const KEY = "editor.wysiwyg";

export function isWysiwygEnabled(): boolean {
  try {
    const stored =
      globalThis.localStorage?.getItem(KEY) ??
      globalThis.sessionStorage?.getItem(KEY);
    // Only an explicit "0" turns it off. Absent (null/undefined) or any other
    // value falls through to the default.
    return stored !== "0";
  } catch {
    // Storage unavailable (private browsing restrictions, etc.) — fall back to
    // the default rather than dropping the author into the source pane.
    return true;
  }
}

/**
 * Persist the author's choice.
 *
 * Both directions clear the sessionStorage copy, because it is read as a
 * fallback: a stale value there would out-vote the choice just made in either
 * direction.
 */
export function setWysiwygEnabled(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEY, on ? "1" : "0");
    globalThis.sessionStorage?.removeItem(KEY);
  } catch {
    // Storage unavailable (private browsing restrictions, etc.) — ignore.
  }
}
