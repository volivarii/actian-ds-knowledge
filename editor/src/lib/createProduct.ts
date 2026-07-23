// Staging a new product: one new file the team owns outright, plus one edit
// per shared record it joins. Everything lands in the same batch, so the whole
// thing is a single reviewable pull request.
//
// The IO is injected so this stays testable without a network or a cart: the
// interesting behaviour is the base a claimed edit is built on (a staged
// version wins over remote, or a chained create silently drops the earlier
// one) and the honest reporting of records that could not be joined.

import { addAppToApps, buildAppStub } from "./appContextCreate";
import type { ContextRecord } from "./contextRecords";

export interface CreateProductValue {
  label: string;
  slug: string;
  headerType: string;
  claim: ContextRecord[];
}

export interface CreateProductDeps {
  /** Reads the file from the remote, with the blob sha to base an edit on. */
  readFile(path: string): Promise<{ text: string; sha: string }>;
  stage(entry: { path: string; content: string; basedOnSha: string }): void;
  /** The batch's pending version of a file, when it already holds one. */
  stagedContent(path: string): { content: string; sha: string } | null;
}

export interface CreateProductResult {
  appPath: string;
  /** Records this product was added to. */
  joined: string[];
  /** Records that already listed this product; nothing was staged for them. */
  unchanged: string[];
  /** Records that could not be joined. The caller must surface these. */
  failed: { path: string; label: string }[];
}

export async function createProduct(
  value: CreateProductValue,
  deps: CreateProductDeps,
): Promise<CreateProductResult> {
  const appPath = `app-context/src/apps/${value.slug}.md`;
  deps.stage({
    path: appPath,
    content: buildAppStub({
      slug: value.slug,
      label: value.label,
      headerType: value.headerType,
    }),
    basedOnSha: "",
  });

  const result: CreateProductResult = {
    appPath,
    joined: [],
    unchanged: [],
    failed: [],
  };

  for (const record of value.claim) {
    try {
      const pending = deps.stagedContent(record.path);
      const base = pending
        ? { text: pending.content, sha: pending.sha }
        : await deps.readFile(record.path);
      const next = addAppToApps(base.text, value.slug);
      if (next === null) {
        result.failed.push({ path: record.path, label: record.label });
        continue;
      }
      if (next === base.text) {
        result.unchanged.push(record.path);
        continue;
      }
      deps.stage({
        path: record.path,
        content: next,
        basedOnSha: base.sha,
      });
      result.joined.push(record.path);
    } catch {
      // One unreadable record must not cost the author the whole product.
      result.failed.push({ path: record.path, label: record.label });
    }
  }

  return result;
}
