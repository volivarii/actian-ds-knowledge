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
  /** Which editing surface this path gets. `"yaml"` edits the frontmatter
   *  text directly (the target state, see the 2026-07-24 spec); omitted keeps
   *  the RJSF form until slice 3 migrates the remaining domains. */
  surface?: "yaml";
}

interface Entry extends FrontmatterFormConfig {
  match: (path: string) => boolean;
}

// Ordered, first-match-wins. Specific entries (words-to-avoid) MUST precede
// the generic content entry that would also match them.
const REGISTRY: Entry[] = [
  {
    match: (p) => /^app-context\/src\/apps\/[^/]+\.md$/.test(p),
    schemaKey: "app-context-app",
    uiSchema: appContextAppUiSchema,
    bodyless: false,
    flowAtDepth: null,
    surface: "yaml",
  },
  {
    match: (p) => /^app-context\/src\/entities\/[^/]+\.md$/.test(p),
    schemaKey: "app-context-entity",
    uiSchema: appContextEntityUiSchema,
    bodyless: false,
    flowAtDepth: 2,
    surface: "yaml",
  },
  {
    match: (p) => /^app-context\/src\/patterns\/[^/]+\.md$/.test(p),
    schemaKey: "app-context-pattern",
    uiSchema: appContextPatternUiSchema,
    bodyless: false,
    flowAtDepth: 2,
    surface: "yaml",
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
  const { match: _m, ...cfg } = hit;
  return cfg;
}
