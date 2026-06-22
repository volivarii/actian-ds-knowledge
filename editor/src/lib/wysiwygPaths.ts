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

/** True only for the single words-to-avoid source file. Used by EditorShell
 *  to route to the FrontmatterBodyEditScreen without a raw string literal. */
export function isWordsToAvoidFile(path: string): boolean {
  return path === "content/src/writing/words-to-avoid.md";
}

/** Foundations files proven WYSIWYG-safe (dist-equivalent + idempotent body
 *  round-trip; see the drift guard). Single source of truth shared with the
 *  guard test. tokens.md + color-primitives.md are EXCLUDED — their tables churn. */
export const FOUNDATIONS_WYSIWYG_SAFE: readonly string[] = [
  "foundations/src/design-guidelines.md",
  "foundations/src/intro.md",
  "foundations/src/handoff-protocol.md",
  "foundations/src/related-guidelines.md",
  "foundations/src/table-of-contents.md",
];

export function isFoundationsWysiwygSafe(path: string): boolean {
  return FOUNDATIONS_WYSIWYG_SAFE.includes(path);
}

/** The WYSIWYG body editor is used only for per-record markdown whose body
 *  round-trips dist-equivalently (app-context + categories), and only when the
 *  alpha flag is on. Precise predicates — not prefix matches. */
export function shouldUseWysiwyg(path: string): boolean {
  return (
    isWysiwygEnabled() &&
    (isAppContextFile(path) ||
      isCategoryFile(path) ||
      isFoundationsWysiwygSafe(path))
  );
}
