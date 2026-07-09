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
  },
  {
    match: (p) => /^app-context\/src\/entities\/[^/]+\.md$/.test(p),
    schemaKey: "app-context-entity",
    uiSchema: appContextEntityUiSchema,
    bodyless: false,
    flowAtDepth: 2,
  },
  {
    match: (p) => /^app-context\/src\/patterns\/[^/]+\.md$/.test(p),
    schemaKey: "app-context-pattern",
    uiSchema: appContextPatternUiSchema,
    bodyless: false,
    flowAtDepth: 2,
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
    match: (p) =>
      /^content\/src\/(writing|patterns|product)\/[^/]+\.md$/.test(p) &&
      !/AUTHORING\.md$/.test(p),
    schemaKey: "content",
    uiSchema: contentUiSchema,
  },
  {
    match: (p) =>
      /^foundations\/src\/[^/]+\.md$/.test(p) && !/AUTHORING\.md$/.test(p),
    schemaKey: "foundations",
    uiSchema: foundationsUiSchema,
    flowAtDepth: null,
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
