/**
 * Opt-in WYSIWYG body editor (alpha).
 *
 * Enable via the Sidebar toggle (persisted to localStorage), or manually:
 *   localStorage.setItem("editor.wysiwyg", "1")
 *
 * Also accepts the legacy sessionStorage key for back-compat with anyone
 * who already set it via devtools.
 */
export function isWysiwygEnabled(): boolean {
  try {
    return (
      globalThis.localStorage?.getItem("editor.wysiwyg") === "1" ||
      globalThis.sessionStorage?.getItem("editor.wysiwyg") === "1"
    );
  } catch {
    return false;
  }
}

/**
 * Persist or clear the WYSIWYG flag.
 * When turning off, clears BOTH localStorage and sessionStorage so a stale
 * session value cannot re-enable the editor after an explicit opt-out.
 */
export function setWysiwygEnabled(on: boolean): void {
  try {
    if (on) {
      globalThis.localStorage?.setItem("editor.wysiwyg", "1");
    } else {
      globalThis.localStorage?.removeItem("editor.wysiwyg");
      globalThis.sessionStorage?.removeItem("editor.wysiwyg");
    }
  } catch {
    // Storage unavailable (private browsing restrictions, etc.) — ignore.
  }
}
