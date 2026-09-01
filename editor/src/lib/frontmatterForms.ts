import type { UiSchema } from "@rjsf/utils";
import { appContextAppUiSchema } from "../uiSchemas/appContextApp";
import { appContextEntityUiSchema } from "../uiSchemas/appContextEntity";
import { appContextPatternUiSchema } from "../uiSchemas/appContextPattern";
import { categoryDefaultsUiSchema } from "../uiSchemas/categoryDefaults";
import { contentUiSchema } from "../uiSchemas/content";
import { foundationsUiSchema } from "../uiSchemas/foundations";
import { wordsToAvoidUiSchema } from "../uiSchemas/wordsToAvoid";
import { isCategoryFile, isWordsToAvoidFile } from "./wysiwygPaths";

export interface FrontmatterFormConfig {
  schemaKey: string;
  uiSchema: UiSchema;
  /** Hide the prose-body editor (record has no body). Default false. */
  bodyless?: boolean;
  /** YAML flow depth for serialization: undefined -> 2 (default), null -> block. */
  flowAtDepth?: number | null;
  /** When true, re-serialize via the comment-preserving Document path so `#`
   *  comments interleaved between data lines survive a form save. Set on the
   *  generic content + foundations entries (whose source files carry such
   *  comments); NOT on app-context/categories/words-to-avoid, whose byte-tested
   *  serialization must not change. */
  preserveComments?: boolean;
  /** When true, frontmatter is OPTIONAL for this domain: a file with no `---`
   *  fence is a valid plain-markdown file and opens silently (no banner). Set
   *  on the prose domains (content + foundations). Record domains
   *  (app-context/categories/words-to-avoid) OMIT it — a missing fence there is
   *  an error and keeps the missing-frontmatter warning. */
  frontmatterOptional?: boolean;
  /** Whether this path offers a raw YAML SOURCE VIEW behind a toggle. The form
   *  is what opens; `"yaml"` edits the frontmatter
   *  text directly (the target state, see the 2026-07-24 spec); omitted keeps
   *  the RJSF form until slice 3 migrates the remaining domains. */
  surface?: "yaml";
}

interface Entry extends FrontmatterFormConfig {
  match: (path: string) => boolean;
  /** Present only for entries whose entire corpus is one flat,
   *  non-recursive directory of `.md` files, relative to the repo root.
   *  Lets tests derive a real-corpus file list from this registry (see
   *  `yamlSurfaceDirectories` below) instead of hardcoding a path list that
   *  can silently drift out of sync with it. Not read by `matchFrontmatterForm`
   *  itself — routing is still decided by `match`. */
  dir?: string;
}

// Ordered, first-match-wins. Specific entries (words-to-avoid) MUST precede
// the generic content entry that would also match them.
const REGISTRY: Entry[] = [
  {
    match: (p) => /^app-context\/src\/apps\/[^/]+\.md$/.test(p),
    schemaKey: "app-context-app",
    uiSchema: appContextAppUiSchema,
    bodyless: false,
    surface: "yaml",
    preserveComments: true,
    dir: "app-context/src/apps",
  },
  {
    match: (p) => /^app-context\/src\/entities\/[^/]+\.md$/.test(p),
    schemaKey: "app-context-entity",
    uiSchema: appContextEntityUiSchema,
    bodyless: false,
    surface: "yaml",
    preserveComments: true,
    dir: "app-context/src/entities",
  },
  {
    match: (p) => /^app-context\/src\/patterns\/[^/]+\.md$/.test(p),
    schemaKey: "app-context-pattern",
    uiSchema: appContextPatternUiSchema,
    bodyless: false,
    surface: "yaml",
    preserveComments: true,
    dir: "app-context/src/patterns",
  },
  {
    match: (p) => isCategoryFile(p),
    schemaKey: "category-defaults",
    uiSchema: categoryDefaultsUiSchema,
  },
  {
    match: (p) => isWordsToAvoidFile(p),
    schemaKey: "content",
    uiSchema: wordsToAvoidUiSchema,
  },
  {
    // Root-level content files (global-guidelines.md, format-spec.md, …) plus
    // the writing/patterns/product subdirs. Excludes the structural files
    // (AUTHORING, README, content-index — content-index keeps its own route).
    // words-to-avoid.md is claimed by the earlier specific entry (first-match).
    match: (p) =>
      /^content\/src\/(?:(?:writing|patterns|product)\/)?[^/]+\.md$/.test(p) &&
      !/(?:AUTHORING|README|content-index)\.md$/.test(p),
    schemaKey: "content",
    uiSchema: contentUiSchema,
    preserveComments: true,
    frontmatterOptional: true,
  },
  {
    match: (p) =>
      /^foundations\/src\/[^/]+\.md$/.test(p) && !/AUTHORING\.md$/.test(p),
    schemaKey: "foundations",
    uiSchema: foundationsUiSchema,
    // No flowAtDepth: foundations serializes via the preserveComments Document
    // path (below), which ignores flowAtDepth entirely. Leaving it would be
    // dead config that misleads a reader into thinking it drives serialization.
    preserveComments: true,
    frontmatterOptional: true,
  },
];

export function matchFrontmatterForm(
  path: string,
): FrontmatterFormConfig | null {
  const hit = REGISTRY.find((e) => e.match(path));
  if (!hit) return null;
  // `dir` is registry-internal (test enumeration only, see
  // yamlSurfaceDirectories below) — strip it so callers only ever see the
  // public FrontmatterFormConfig shape.
  const { match: _m, dir: _d, ...cfg } = hit;
  return cfg;
}

/** The slice of a registry entry `yamlDirsOrThrow` needs — just enough to
 *  spot a `surface: "yaml"` entry missing its `dir`, without depending on
 *  the registry-internal `Entry` shape (private to this module) or the
 *  routing-only `match` function tests have no reason to construct. */
type YamlDirCandidate = Pick<FrontmatterFormConfig, "schemaKey" | "surface"> & {
  dir?: string;
};

/** Pure (exported for tests): every `surface: "yaml"` entry's `dir`, in
 *  registry order. Throws — rather than silently dropping the entry — the
 *  moment one has `surface: "yaml"` but no `dir`, which is the failure mode
 *  this whole mechanism exists to prevent: without the throw, a future
 *  domain that gains `surface: "yaml"` without also adding a `dir` would
 *  narrow the corpus `yamlSurfaceDirectories()` enumerates, and
 *  `assembleYaml.test.ts`'s `files.length > 20` floor would keep passing on
 *  whatever's left, never noticing the domain went unwalked. */
export function yamlDirsOrThrow(entries: YamlDirCandidate[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (e.surface !== "yaml") continue;
    if (e.dir === undefined) {
      throw new Error(
        `frontmatterForms registry entry "${e.schemaKey}" has surface: "yaml" but no \`dir\` — ` +
          `yamlSurfaceDirectories() cannot enumerate its corpus, which would silently narrow the ` +
          `byte-identity round-trip guard in tests/frontmatter-engine/assembleYaml.test.ts. Add a \`dir\`.`,
      );
    }
    out.push(e.dir);
  }
  return out;
}

/** Repo-root-relative directories whose entire `.md` corpus is routed to the
 *  YAML surface (`surface: "yaml"`) — derived from this registry, not a
 *  hand-maintained list, so a domain that later gains `surface: "yaml"` (with
 *  its own `dir`) widens the corpus this enumerates automatically. Consumed
 *  by the byte-identity round-trip guard in
 *  `tests/frontmatter-engine/assembleYaml.test.ts`. */
export function yamlSurfaceDirectories(): string[] {
  return yamlDirsOrThrow(REGISTRY);
}
