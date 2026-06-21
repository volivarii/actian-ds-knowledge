/** Opt-in WYSIWYG body editor (alpha). Set sessionStorage["editor.wysiwyg"]="1" to enable. */
export function isWysiwygEnabled(): boolean {
  try {
    return globalThis.sessionStorage?.getItem("editor.wysiwyg") === "1";
  } catch {
    return false;
  }
}
