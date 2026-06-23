import { isWysiwygEnabled } from "./editorFlags";
import domainsRaw from "../../../domains.json";

type DomainsConfig = {
  domains: Record<string, { wysiwyg?: { safePaths?: string[] } }>;
};

/** Union of every domain's wysiwyg.safePaths from domains.json — the single
 *  source of truth shared with the drift guard and the baseline runner. */
const WYSIWYG_SAFE_PATHS: ReadonlySet<string> = new Set(
  Object.values((domainsRaw as DomainsConfig).domains).flatMap(
    (d) => d.wysiwyg?.safePaths ?? [],
  ),
);

/** True for any source file the registry marks WYSIWYG-safe (guard-verified). */
export function isWysiwygSafePath(path: string): boolean {
  return WYSIWYG_SAFE_PATHS.has(path);
}

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

/** The WYSIWYG body editor is used only for markdown whose body round-trips
 *  safely (app-context, categories, and registry-safe paths), and only when the
 *  alpha flag is on. Foundations/accessibility are dist-equivalent (guard-proven
 *  per file); content is rendered-equivalent (proven holistically by the
 *  derive-no-op gate). Precise predicates, not prefix matches. */
export function shouldUseWysiwyg(path: string): boolean {
  return (
    isWysiwygEnabled() &&
    (isAppContextFile(path) || isCategoryFile(path) || isWysiwygSafePath(path))
  );
}
