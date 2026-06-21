import { isWysiwygEnabled } from "./editorFlags";

/** True only for the three per-record app-context markdown kinds (apps,
 *  entities, patterns). Excludes the dist JSON, terminology.yml, nested paths,
 *  and other app-context files. Lives here (not in EditorShell) so screens can
 *  reuse it without a circular import. */
export function isAppContextFile(path: string): boolean {
  return /^app-context\/src\/(apps|entities|patterns)\/[^/]+\.md$/.test(path);
}

/** The WYSIWYG body editor is used only for per-record app-context markdown,
 *  and only when the alpha flag is on. Precise predicate — not a prefix match. */
export function shouldUseWysiwyg(path: string): boolean {
  return isWysiwygEnabled() && isAppContextFile(path);
}
