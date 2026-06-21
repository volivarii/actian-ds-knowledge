import { isWysiwygEnabled } from "./editorFlags";

/** True only for the three per-record app-context markdown kinds (apps,
 *  entities, patterns). Excludes the dist JSON, terminology.yml, nested paths,
 *  and other app-context files. Lives here (not in EditorShell) so screens can
 *  reuse it without a circular import. */
export function isAppContextFile(path: string): boolean {
  return /^app-context\/src\/(apps|entities|patterns)\/[^/]+\.md$/.test(path);
}

/** True only for component category records (components/src/categories/<slug>.md).
 *  Excludes AUTHORING.md and nested paths. */
export function isCategoryFile(path: string): boolean {
  return (
    /^components\/src\/categories\/[^/]+\.md$/.test(path) &&
    !/AUTHORING\.md$/.test(path)
  );
}

/** The WYSIWYG body editor is used only for per-record markdown whose body
 *  round-trips dist-equivalently (app-context + categories), and only when the
 *  alpha flag is on. Precise predicates — not prefix matches. */
export function shouldUseWysiwyg(path: string): boolean {
  return isWysiwygEnabled() && (isAppContextFile(path) || isCategoryFile(path));
}
