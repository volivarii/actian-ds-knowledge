// Which links a record stores in its own file, how to read them, and the one
// writer every screen uses. The writer edits a plain object; each screen keeps
// its own serializer (formData in FrontmatterBodyEditScreen, stringifyYaml for
// _meta.yml), so no text rewriting happens here.
import type { ConnectionEdit, OwnedField, OwnedValues } from "./types";
import { VERBS } from "./vocabulary";

export type RecordKind =
  | "component"
  | "category"
  | "content"
  | "pattern"
  | "entity"
  | "persona"
  | "app"
  | "a11y"
  | "foundation"
  | "motion"
  | "term";

const PREFIX_KIND: Record<string, RecordKind> = {
  component: "component",
  category: "category",
  content: "content",
  pattern: "pattern",
  entity: "entity",
  persona: "persona",
  app: "app",
  a11y: "a11y",
  foundation: "foundation",
  motion: "motion",
  term: "term",
};
const TYPE_PREFIX: Record<string, string> = {
  component: "component",
  category: "category",
  a11y_criterion: "a11y",
  foundation_section: "foundation",
  motion_pattern: "motion",
  app: "app",
  ux_pattern: "pattern",
  app_entity: "entity",
  terminology_term: "term",
  content_topic: "content",
  persona: "persona",
};

export function recordKindOf(nodeId: string): RecordKind | null {
  const i = nodeId.indexOf(":");
  if (i < 0) return null;
  return PREFIX_KIND[nodeId.slice(0, i)] ?? null;
}
export function nodeIdFor(type: string, slug: string): string {
  return `${TYPE_PREFIX[type] ?? type}:${slug}`;
}
export function slugOfId(nodeId: string): string {
  const i = nodeId.indexOf(":");
  return i < 0 ? nodeId : nodeId.slice(i + 1);
}
export function fieldKey(field: string[]): string {
  return field.join(".");
}

const REFS: OwnedField[] = [
  { edgeType: "a11y_ref", field: ["a11y_refs"], type: "a11y_criterion", shape: "ref" },
  { edgeType: "foundations_ref", field: ["foundations_refs"], type: "foundation_section", shape: "ref" },
  { edgeType: "motion_ref", field: ["motion_refs"], type: "motion_pattern", shape: "ref" },
];
const APPS: OwnedField = { edgeType: "in_app", field: ["apps"], type: "app", shape: "slug" };

export const OWNED: Partial<Record<RecordKind, OwnedField[]>> = {
  component: REFS,
  category: REFS,
  content: [{ edgeType: "related", field: ["relatedComponents"], type: "component", shape: "slug" }],
  pattern: [APPS, { edgeType: "uses_component", field: ["components"], type: "component", shape: "slug" }],
  entity: [
    APPS,
    { edgeType: "shown_in", field: ["patterns"], type: "ux_pattern", shape: "slug" },
    ...VERBS.map(
      (v): OwnedField => ({
        edgeType: "entity_related",
        predicate: v,
        field: ["relationships", v],
        type: "app_entity",
        shape: "slug",
      }),
    ),
  ],
  persona: [APPS],
};

function getIn(data: unknown, path: string[]): unknown {
  let cur: unknown = data;
  for (const k of path) {
    if (!cur || typeof cur !== "object" || !Object.hasOwn(cur, k)) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}
function slugOfEntry(e: unknown): string | null {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && typeof (e as { ref?: unknown }).ref === "string")
    return (e as { ref: string }).ref;
  return null;
}

export function ownedValues(kind: RecordKind, data: unknown): OwnedValues {
  const out: OwnedValues = {};
  for (const f of OWNED[kind] ?? []) {
    const v = getIn(data, f.field);
    if (!Array.isArray(v)) continue;
    const slugs = v.map(slugOfEntry).filter((s): s is string => !!s);
    out[fieldKey(f.field)] = [...new Set(slugs)];
  }
  return out;
}

/** Apply one edit to a record's data. Never mutates the input; returns the
 *  input itself when the edit changes nothing (add of a present slug, remove
 *  of an absent one). Removal removes every copy. An emptied nested list
 *  (relationships.<verb>) is deleted but the relationships block stays, as {}
 *  when empty, because the entity schema requires it. An emptied ref list is
 *  deleted, since a present one must hold at least one ref; an emptied slug
 *  list stays as [].
 *
 *  `original` is the record as loaded. Adding a slug it held puts its entries
 *  back as they were, every copy, note included, at their old positions, so a
 *  remove followed by an add (Undo, or picking it again) leaves no change. */
export function applyConnectionEdit(
  data: Record<string, unknown>,
  edit: ConnectionEdit,
  original?: Record<string, unknown>,
): Record<string, unknown> {
  const present = (getIn(data, edit.field) as unknown[] | undefined)?.some?.((e) => slugOfEntry(e) === edit.slug) ?? false;
  if (edit.op === "add" ? present : !present) return data;

  const root: Record<string, unknown> = { ...(data ?? {}) };
  let parent = root;
  for (const k of edit.field.slice(0, -1)) {
    const child = parent[k];
    const copy: Record<string, unknown> =
      child && typeof child === "object" && !Array.isArray(child) ? { ...(child as Record<string, unknown>) } : {};
    parent[k] = copy;
    parent = copy;
  }
  const leaf = edit.field[edit.field.length - 1]!;
  const list = Array.isArray(parent[leaf]) ? [...(parent[leaf] as unknown[])] : [];
  if (edit.op === "add") {
    const was = getIn(original, edit.field);
    const back = Array.isArray(was)
      ? was.flatMap((e, i) => (slugOfEntry(e) === edit.slug ? [{ e, i }] : []))
      : [];
    if (back.length === 0) list.push(edit.shape === "ref" ? { ref: edit.slug } : edit.slug);
    for (const { e, i } of back) list.splice(Math.min(i, list.length), 0, structuredClone(e));
    parent[leaf] = list;
    return root;
  }
  const kept = list.filter((e) => slugOfEntry(e) !== edit.slug);
  if (kept.length === 0 && (edit.field.length > 1 || edit.shape === "ref")) delete parent[leaf];
  else parent[leaf] = kept;
  return root;
}

/** Put the owned fields back exactly as they are in `original` (entries,
 *  notes, order), keeping every other field of `current`. A field the
 *  original did not have is deleted. */
export function restoreOwned(
  kind: RecordKind,
  current: Record<string, unknown>,
  original: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  for (const top of new Set((OWNED[kind] ?? []).map((f) => f.field[0]!))) {
    if (Object.hasOwn(original, top)) next[top] = structuredClone(original[top]);
    else delete next[top];
  }
  return next;
}
