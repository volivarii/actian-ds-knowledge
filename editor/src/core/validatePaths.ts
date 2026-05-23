// Read-only path refusal — the first gate in the Commit-PR core.
//
// Two classes of paths are off-limits to the editor:
//   1. **Figma-synced**: tokens.json/.css and component registries. Changing
//      these in the editor would conflict with the next sync-from-figma run.
//   2. **CI-derived**: anything under */dist/, and the llms.txt files. These
//      are regenerated from source by the knowledge-repo CI; hand-edits would
//      be silently overwritten.
//
// Everything else — components/src, accessibility, foundations/src, content/src,
// app-context, fm-to-ds-map, components/src/icon-groups — is writable.

const READONLY_EXACT = new Set<string>([
  "tokens/tokens.json",
  "tokens/tokens.css",
  "tokens/token-reference.md",
  "llms.txt",
  "llms-full.txt",
]);

const READONLY_PREFIXES: ReadonlyArray<string> = [
  "components/dist/registries/",
];

// `<top-level>/dist/...` — every domain's CI-derived tree.
const READONLY_DIST_RE = /^[^/]+\/dist\//;

export function isReadOnlyPath(path: string): boolean {
  if (READONLY_EXACT.has(path)) return true;
  if (READONLY_PREFIXES.some((p) => path.startsWith(p))) return true;
  if (READONLY_DIST_RE.test(path)) return true;
  return false;
}
