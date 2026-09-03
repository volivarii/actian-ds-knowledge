// Creating an entity or a pattern, and the other half of the same flow: joining
// one that already exists.
//
// Those two are one flow, not two. Entity and pattern slugs are a single flat
// namespace shared by every product, so a team typing a name that is already
// taken is not an error case, it is the common case: the record they want
// usually exists already and belongs to somebody else's product too. Creating a
// second file would fragment the vocabulary, which is the failure this whole
// layer exists to avoid. So the dialog refuses the duplicate and offers to join
// the existing record instead, and joining is a real, first-class path.

import {
  addAppToApps,
  buildEntityStub,
  buildPatternStub,
} from "./appContextCreate";

export type ContextRecordKind = "entity" | "pattern";

const DIR_BY_KIND: Record<ContextRecordKind, string> = {
  entity: "entities",
  pattern: "patterns",
};

export function pathForContextRecord(
  kind: ContextRecordKind,
  slug: string,
): string {
  return `app-context/src/${DIR_BY_KIND[kind]}/${slug}.md`;
}

export interface CreateContextRecordValue {
  kind: ContextRecordKind;
  slug: string;
  label: string;
  /** Product slugs this record belongs to. */
  apps: string[];
  /** Patterns only. */
  components?: string[];
}

export interface ContextRecordDeps {
  readFile(path: string): Promise<{ text: string; sha: string }>;
  stage(entry: { path: string; content: string; basedOnSha: string }): void;
  stagedContent(path: string): { content: string; sha: string } | null;
}

export interface CreateRecordResult {
  path: string;
  /** False when the batch already holds a file at this path; nothing written. */
  created: boolean;
}

/**
 * Stages a brand new entity or pattern.
 *
 * Refuses when the batch already carries a file at that path, and refuses HERE
 * rather than trusting the dialog to have checked. The cart keeps one entry per
 * path and a second add replaces the first, so staging blindly would overwrite
 * whatever the author had already written into that record: not just its
 * product list, but the description, properties and relationships they typed
 * after creating it. Silent, schema-valid, and invisible in the resulting pull
 * request, which is the worst shape a bug can take here.
 */
export function createContextRecord(
  value: CreateContextRecordValue,
  deps: ContextRecordDeps,
): CreateRecordResult {
  const path = pathForContextRecord(value.kind, value.slug);
  if (deps.stagedContent(path) !== null) return { path, created: false };

  const opts = {
    slug: value.slug,
    label: value.label,
    apps: value.apps,
    components: value.components,
  };
  deps.stage({
    path,
    content:
      value.kind === "entity" ? buildEntityStub(opts) : buildPatternStub(opts),
    basedOnSha: "",
  });
  return { path, created: true };
}

export interface JoinResult {
  /** Products added to the record by this call. */
  added: string[];
  /** Products the record already listed; nothing was written for them. */
  alreadyListed: string[];
  /** True when the record could not be read or has no apps list to join. */
  failed: boolean;
}

export async function joinExistingRecord(
  target: { path: string; label: string; apps: string[] },
  deps: ContextRecordDeps,
): Promise<JoinResult> {
  const result: JoinResult = { added: [], alreadyListed: [], failed: false };
  let base: { text: string; sha: string };
  try {
    const pending = deps.stagedContent(target.path);
    base = pending
      ? { text: pending.content, sha: pending.sha }
      : await deps.readFile(target.path);
  } catch {
    result.failed = true;
    return result;
  }

  // One staged edit carrying every addition, not one per product: the cart is
  // keyed by path, so separate stages would overwrite each other anyway.
  let text = base.text;
  for (const app of target.apps) {
    const next = addAppToApps(text, app);
    if (next === null) {
      result.failed = true;
      return result;
    }
    if (next === text) result.alreadyListed.push(app);
    else {
      result.added.push(app);
      text = next;
    }
  }

  if (result.added.length > 0) {
    deps.stage({ path: target.path, content: text, basedOnSha: base.sha });
  }
  return result;
}
