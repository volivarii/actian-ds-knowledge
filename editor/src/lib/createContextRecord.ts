// Creating an entity or a feature, and the other half of the same flow: joining
// one that already exists.
//
// Those two are one feature, not two. Entity and feature slugs are a single flat
// namespace shared by every product, so a team typing a name that is already
// taken is not an error case, it is the common case: the record they want
// usually exists already and belongs to somebody else's product too. Creating a
// second file would fragment the vocabulary, which is the failure this whole
// layer exists to avoid. So the dialog refuses the duplicate and offers to join
// the existing record instead, and joining is a real, first-class path.

import {
  addAppToApps,
  buildEntityStub,
  buildFeatureStub,
} from "./appContextCreate";

export type ContextRecordKind = "entity" | "feature";

const DIR_BY_KIND: Record<ContextRecordKind, string> = {
  entity: "entities",
  feature: "patterns",
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
  /** Features only. */
  components?: string[];
}

export interface ContextRecordDeps {
  readFile(path: string): Promise<{ text: string; sha: string }>;
  stage(entry: { path: string; content: string; basedOnSha: string }): void;
  stagedContent(path: string): { content: string; sha: string } | null;
}

export function createContextRecord(
  value: CreateContextRecordValue,
  deps: ContextRecordDeps,
): { path: string } {
  const path = pathForContextRecord(value.kind, value.slug);
  const opts = {
    slug: value.slug,
    label: value.label,
    apps: value.apps,
    components: value.components,
  };
  deps.stage({
    path,
    content:
      value.kind === "entity" ? buildEntityStub(opts) : buildFeatureStub(opts),
    basedOnSha: "",
  });
  return { path };
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
