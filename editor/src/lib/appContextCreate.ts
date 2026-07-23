// Creating a new product in the application-context layer, and joining that
// product to records other products already depend on.
//
// Two pure text transforms, no IO:
//   buildAppStub: the new app-context/src/apps/<slug>.md file
//   addAppToApps: appends an app slug to an entity's or a feature's
//                  frontmatter `apps:` list
//
// addAppToApps is frontmatter-scoped by construction: it splits the file at
// the frontmatter fence and rewrites only that region, so an `apps:` block
// quoted in the prose body can never be rewritten. Same class of trap as the
// anchor rename's fences, avoided the cheap way.

import { stringify as stringifyYaml } from "yaml";

export interface AppStubOptions {
  slug: string;
  label: string;
  /** DS global-header variant. Defaults to the label. */
  headerType?: string;
}

/**
 * Emits a string as a YAML scalar, quoted whenever bare would not read back as
 * that same string.
 *
 * Delegated to the YAML serializer rather than a character-class test, because
 * the values that need quoting are not about which characters they contain: a
 * product named "2026" reads back as a number, and slugs "true" / "null" read
 * back as a boolean and a null. All three pass a kebab-case shape check, all
 * three are reachable by typing a name into the dialog, and each one silently
 * violates the schema's `"type": "string"` at submit time, far from the field
 * that caused it.
 */
function yamlScalar(value: string): string {
  return stringifyYaml(value).trimEnd();
}

/**
 * The starting file for a new product.
 *
 * The three canonical sections ship EMPTY on purpose. derive-app-context.js
 * reads Purpose through sectionProse, which joins every non-blank line in the
 * section, and Users/Signals through sectionBullets. A placeholder sentence or
 * comment left here would derive into the product's real purpose/users/signals
 * and travel to consumers as if an author had written it. Headings only.
 */
export function buildAppStub({
  slug,
  label,
  headerType,
}: AppStubOptions): string {
  const header = (headerType ?? "").trim() || label;
  return [
    "---",
    "# yaml-language-server: $schema=../../../schemas/app-context-app.json",
    "_schema_version: 1",
    `slug: ${yamlScalar(slug)}`,
    `label: ${yamlScalar(label)}`,
    "header:",
    `  type: ${yamlScalar(header)}`,
    "sidebar: []",
    "---",
    "",
    "## Purpose",
    "",
    "## Users",
    "",
    "## Signals",
    "",
  ].join("\n");
}

export interface ContextRecordStubOptions {
  slug: string;
  label: string;
  /** Product slugs this record belongs to. */
  apps: string[];
  /** Features only: the DS components the feature composes. */
  components?: string[];
}

/** `apps:`-style block sequence, or the key omitted entirely when empty. */
function blockList(key: string, values: string[]): string[] {
  if (values.length === 0) return [];
  return [`${key}:`, ...values.map((v) => `  - ${yamlScalar(v)}`)];
}

/**
 * The starting file for a new entity or feature.
 *
 * The body ships EMPTY, and for these two kinds that matters even more than it
 * does for a product: derive-app-context.js reads the whole body as the record's
 * `description` (bodyField), so a placeholder sentence would not sit unused in a
 * section, it would BE the description every consumer reads.
 */
function buildRecordStub(
  schema: string,
  opts: ContextRecordStubOptions,
  core: string[],
): string {
  return [
    "---",
    `# yaml-language-server: $schema=../../../schemas/${schema}`,
    "_schema_version: 1",
    `slug: ${yamlScalar(opts.slug)}`,
    `label: ${yamlScalar(opts.label)}`,
    ...core,
    ...blockList("apps", opts.apps),
    "---",
    "",
  ].join("\n");
}

export function buildEntityStub(opts: ContextRecordStubOptions): string {
  // properties and relationships are schema-required, so they are written empty
  // rather than omitted; the author fills them in the record's own editor.
  return buildRecordStub("app-context-entity.json", opts, [
    "properties: []",
    "relationships: {}",
  ]);
}

export function buildFeatureStub(opts: ContextRecordStubOptions): string {
  return buildRecordStub(
    "app-context-pattern.json",
    opts,
    blockList("components", opts.components ?? []),
  );
}

const FRONTMATTER_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---)/;

/**
 * Appends `appSlug` to the record's top-level `apps:` list.
 *
 * Returns the rewritten file, the input byte-identical when the app is already
 * listed, or null when the record has no frontmatter or no `apps:` key to join.
 * Null is a real answer the caller must surface: a record the editor could not
 * update is a record whose product list is now wrong.
 */
export function addAppToApps(text: string, appSlug: string): string | null {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return null;
  const [matched, open, frontmatter, close] = m as unknown as [
    string,
    string,
    string,
    string,
  ];
  const next = appendToAppsBlock(frontmatter, appSlug);
  if (next === null) return null;
  if (next === frontmatter) return text;
  return open + next + close + text.slice(matched.length);
}

function appendToAppsBlock(
  frontmatter: string,
  appSlug: string,
): string | null {
  const lines = frontmatter.split("\n");
  // Column 0 only. A nested `apps:` (inside useCases, say) is a different key.
  const keyLine = lines.findIndex((l) => /^apps:/.test(l));
  if (keyLine === -1) return null;

  const line = lines[keyLine]!;
  const inlineValue = line.slice("apps:".length).trim();

  if (inlineValue.startsWith("[")) {
    const openBracket = line.indexOf("[");
    const closeBracket = line.lastIndexOf("]");
    if (closeBracket < openBracket) return null;
    const inner = line.slice(openBracket + 1, closeBracket).trim();
    const items = inner
      ? inner
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    if (items.includes(appSlug)) return frontmatter;
    lines[keyLine] =
      line.slice(0, openBracket + 1) +
      [...items, appSlug].join(", ") +
      line.slice(closeBracket);
    return lines.join("\n");
  }

  // Anything other than a bare `apps:` or a flow sequence is a shape this
  // transform does not understand, so refuse rather than guess.
  if (inlineValue !== "") return null;

  const items: string[] = [];
  let lastItem = keyLine;
  let indent = "  ";
  for (let i = keyLine + 1; i < lines.length; i++) {
    // Zero indent is legal YAML for a sequence under a key, and matching it
    // matters: treating `- studio` at column 0 as "no items" would append a
    // two-space item below it and leave a list at two indents, which no longer
    // parses as one sequence.
    const item = /^(\s*)-\s+(\S.*?)\s*$/.exec(lines[i]!);
    if (!item) break;
    indent = item[1]!;
    items.push(item[2]!);
    lastItem = i;
  }
  if (items.includes(appSlug)) return frontmatter;
  const cr = lines[lastItem]!.endsWith("\r") ? "\r" : "";
  lines.splice(lastItem + 1, 0, `${indent}- ${appSlug}${cr}`);
  return lines.join("\n");
}
