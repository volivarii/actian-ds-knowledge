// Thin wrappers around the `yaml` package. The contract is *semantic*
// round-trip — parse → stringify → parse yields the same JS shape.
//
// `stringifyYaml` accepts an options bag:
//   - `originalText`: preserves the leading header (blank lines + `#`
//     comments above the first data line) from the source file. Load-bearing
//     for files like `components/src/<slug>/_meta.yml` that start with a
//     `# yaml-language-server: $schema=…` directive — stripping it would
//     break every author's IDE schema-hinting on the next checkout.
//   - `flowAtDepth`: switches every YAMLMap at that depth (1-based, root
//     map = depth 0) to flow style; also recurses into YAMLSeq items at
//     that depth, so array-of-object fields like `examples` emit their
//     items as inline `- { … }` flow maps. The knowledge repo's `_meta.yml`
//     files are authored in flow style — the `domains.<name>` maps live at
//     depth 2 (as do `examples` / `a11y_refs` items) — so the editor calls
//     stringifyYaml with flowAtDepth: 2 to round-trip them byte-identically
//     instead of churning every file to block style on first edit. (The
//     derive parser, scripts/lib/frontmatter, parses both styles; flow is a
//     round-trip-stability choice, not a parser requirement.)
//
// In-body / trailing comments are NOT preserved in Phase 1a. The `yaml`
// package's CST API supports it, but the document-mutate-via-JSON path is
// non-trivial and lands in PR 2 if authors hit a case where it bites.

import { joinFrontmatter } from "../frontmatter-engine/assembleYaml";
import yaml from "yaml";

export interface StringifyOptions {
  originalText?: string;
  flowAtDepth?: number;
}

export function parseYaml<T = unknown>(text: string): T {
  return yaml.parse(text) as T;
}

export function stringifyYaml(
  value: unknown,
  opts?: StringifyOptions | string,
): string {
  const { originalText, flowAtDepth } =
    typeof opts === "string"
      ? { originalText: opts, flowAtDepth: undefined }
      : (opts ?? {});

  let body: string;
  if (flowAtDepth === undefined) {
    body = yaml.stringify(value, { lineWidth: 0 });
  } else {
    const doc = new yaml.Document(value);
    if (doc.contents) markFlowAtDepth(doc.contents, 0, flowAtDepth);
    body = doc.toString({ lineWidth: 0 });
  }

  if (!originalText) return body;
  const header = extractLeadingHeader(originalText);
  return header ? header + body : body;
}

function markFlowAtDepth(
  node: unknown,
  currentDepth: number,
  targetDepth: number,
): void {
  if (!node || typeof node !== "object") return;
  const typed = node as {
    constructor?: { name?: string };
    items?: Array<unknown>;
    flow?: boolean;
  };
  if (typed.constructor?.name === "YAMLSeq") {
    // Recurse into sequence items at depth+1: the array itself is the
    // value at currentDepth, so items inside it are one level deeper.
    for (const item of typed.items ?? []) {
      markFlowAtDepth(item, currentDepth + 1, targetDepth);
    }
    return;
  }
  if (typed.constructor?.name !== "YAMLMap") return;
  if (currentDepth === targetDepth) {
    typed.flow = true;
    return;
  }
  const mapItems = typed.items as Array<{ value?: unknown }>;
  for (const item of mapItems ?? []) {
    markFlowAtDepth(item.value, currentDepth + 1, targetDepth);
  }
}

/**
 * Did the author change anything, compared with the frontmatter as authored?
 *
 * #631: 30 of the 96 form-routed files were not byte fixed points of their own
 * save path. app-context records are authored with padded flow maps
 * (`{ name: x }`) beside unpadded flow seqs (`[A, B]`), and yaml's
 * `flowCollectionPadding` is ONE boolean for both, so no setting of it can
 * reproduce those bytes; `words-to-avoid.md` loses the quotes around its
 * title. Re-emitting an unedited document therefore produced a file that
 * differed from main by a reformat, which the editor then had to treat as an
 * edit. The cheapest honest answer is not to re-emit it at all: when nothing
 * changed, the author's own bytes ARE the correct output.
 *
 * Compares against the document's own parse (not the caller's `formData`
 * origin), so a form that never touched a key agrees with the source by
 * construction. Any doubt resolves to `false`, i.e. serialize as before:
 * emitting a reformat is a cosmetic defect, dropping an edit is data loss.
 */
export function isUnchangedFromSource(
  formData: unknown,
  frontmatterText: string | null,
): boolean {
  if (!frontmatterText) return false;
  return isUnchangedAgainst(yaml.parseDocument(frontmatterText), formData);
}

/** The same question asked of a document the caller has already parsed, so the
 *  save path does not parse the frontmatter twice on every debounced keystroke. */
function isUnchangedAgainst(doc: yaml.Document, formData: unknown): boolean {
  // `parseDocument` does NOT throw on malformed YAML: it returns a document
  // carrying `errors` and a best-effort parse (": : not yaml [" comes back as
  // `{"": {"": "not yaml ["}}`). Reading `errors` is the only way to refuse it;
  // a try/catch here would be dead code that looks like a guard.
  if (doc.errors.length > 0) return false;
  const original = (doc.toJS() ?? {}) as Record<string, unknown>;
  if (formData === null || typeof formData !== "object" || Array.isArray(formData)) return false;
  const data = formData as Record<string, unknown>;
  const originalKeys = Object.keys(original);
  const dataKeys = Object.keys(data);
  // Key ORDER is deliberately NOT compared. This path merges values into the
  // author's document; it never moves a pair, because `doc.set` on an existing
  // key replaces the value in place. So a reordered `formData` produces the
  // author's original order whether or not the comparison notices, and
  // treating it as an edit would only cost a reformat that changes nothing.
  // The surface that CAN reorder keys is the YAML source view, and it writes
  // the author's text verbatim (assembleYamlFrontmatterFile).
  if (originalKeys.length !== dataKeys.length) return false;
  for (const key of originalKeys) {
    // `hasOwnProperty`, not `in`: `"toString" in {}` is true, so `in` would
    // pass a key the form actually dropped through to a comparison against an
    // inherited function. Matches deepEqual's own membership test below.
    if (!Object.prototype.hasOwnProperty.call(data, key)) return false;
    if (!deepEqual(original[key], data[key])) return false;
  }
  return true;
}

/**
 * Re-serialize form frontmatter into a full `---`-fenced file while preserving
 * EVERY `#` comment in the original block — including comments interleaved
 * BETWEEN data lines (which `stringifyYaml`'s `originalText` path drops, since
 * it only keeps the leading header above the first data line).
 *
 * Approach: parse the original frontmatter into a `yaml` Document (which retains
 * comments as node properties — an interleaved block attaches as `commentBefore`
 * on the KEY node of the following pair). The Document MUST be built from the
 * original TEXT: comments live in the source bytes, not in the already-parsed
 * JS `formData` the caller holds, so this re-parse is unavoidable. Then merge
 * the new form values in, touching as little as possible:
 *   - Snapshot the original as JS once (`doc.toJS()`).
 *   - Update ONLY keys whose value actually CHANGED (deep-equal vs the snapshot).
 *     Skipping unchanged keys leaves their original nodes intact — preserving
 *     both flow style (`[a, b, c]`, `- { ref, note }`) and any attached comment,
 *     and avoiding the churn that a blanket `doc.set` on every key would cause
 *     (it reflows untouched inline values to block style).
 *   - Delete keys the form removed via a PRE-COLLECTED key list + key-lookup
 *     deletion. Never iterate `doc.contents.items` while calling `doc.delete()`:
 *     removing an item mid-iteration shifts the live array and skips the next
 *     element, so two adjacent removed keys would leave the second behind (it
 *     would resurrect into the saved file, and thence into dist).
 * For a changed existing key, `doc.set` reuses the current pair's key node
 * (keeping its `commentBefore`) and only replaces the value, so the comment
 * survives. Reformatted values may switch flow → block style; that is dist-safe
 * (content-derive and foundations-derive both parse frontmatter semantically).
 * COMMENTS are the invariant here, not flow style.
 *
 * When `frontmatterText` is null/empty (new file — nothing to preserve) this
 * delegates to the plain `stringifyYaml` path.
 */
export function assembleFrontmatterFilePreservingComments(
  formData: unknown,
  frontmatterText: string | null,
  body: string,
): string {
  let fm: string;
  if (!frontmatterText) {
    fm = stringifyYaml(formData);
  } else {
    // Re-parse from TEXT (not from the caller's parsed JS): comments only exist
    // in the source bytes, and a `yaml.Document` retains them as node props.
    const doc = yaml.parseDocument(frontmatterText);
    // Nothing edited: the author's bytes are already the right answer, and
    // re-emitting them is what made 29 of these files unreachable fixed
    // points. Asked of the document just parsed, not of the text again.
    if (isUnchangedAgainst(doc, formData)) {
      return joinFrontmatter(frontmatterText, body);
    }
    const data = (formData ?? {}) as Record<string, unknown>;
    const original = (doc.toJS() ?? {}) as Record<string, unknown>;
    // Delete removed keys via a pre-collected list + key-lookup deletion —
    // NOT by iterating doc.contents.items (mutating that live array mid-loop
    // skips adjacent removals and resurrects a deleted key).
    const removedKeys = Object.keys(original).filter((k) => !(k in data));
    for (const key of removedKeys) doc.delete(key);
    // Update only CHANGED keys; untouched nodes (flow style + comments) stay.
    for (const key of Object.keys(data)) {
      if (!deepEqual(original[key], data[key])) doc.set(key, data[key]);
    }
    // flowCollectionPadding: false → emit `[a, b, c]` / `{ref: x}` (the source
    // style these files are authored in) rather than yaml's default padded
    // `[ a, b, c ]`. Keeps untouched inline arrays byte-stable, not just flow-
    // style-stable. Semantic parse is unaffected either way (dist-safe).
    fm = doc.toString({ lineWidth: 0, flowCollectionPadding: false });
  }
  return joinFrontmatter(fm, body);
}

/**
 * Structural deep-equal for the plain JSON-ish shapes frontmatter parses to
 * (primitives, arrays, plain objects). Order-independent for object keys,
 * order-sensitive for arrays (list order is meaningful in these frontmatters).
 * Local (not `node:util`) to keep this module free of node:* imports — it is
 * bundled into the browser editor.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr && bArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, k)) return false;
    if (!deepEqual(aObj[k], bObj[k])) return false;
  }
  return true;
}

function extractLeadingHeader(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      out.push(line);
    } else {
      break;
    }
  }
  if (out.length === 0) return "";
  return out.join("\n") + "\n";
}

/**
 * Whether a blank line follows the closing fence is the loaded file's own
 * shape. The rich editor's round trip drops one at the top of the body, so a
 * save restores it where the file HAD it; it never adds one where the file
 * had none (that was a change the author never made, sub-task 1114), and it
 * never strips one the author typed.
 */
export function preserveFenceSeparator(loadedBody: string, editedBody: string): string {
  if (loadedBody.startsWith("\n") && !editedBody.startsWith("\n")) return "\n" + editedBody;
  return editedBody;
}
