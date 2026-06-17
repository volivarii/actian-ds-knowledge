// RefStore abstraction — dispatches frontmatter write-back to the correct
// underlying helper based on the ref-field type.
//
// Object-ref fields (a11y_refs, motion_refs, foundations_refs) use
// addRefToFrontmatter / removeRefFromFrontmatter, which write block-style
// `- { ref: slug, note: ... }` entries.
//
// Flat-array fields (relatedComponents) use addFlatRefToFrontmatter /
// removeFlatRefFromFrontmatter, which write `fieldName: [a, b, c]` lines.
//
// This lets ConnectionsPopover stay agnostic of the format difference:
// it calls store.addRef / store.removeRef and the store dispatches.

import type { RefType, AnyRefField } from "./refGraph";
import {
  addRefToFrontmatter,
  removeRefFromFrontmatter,
} from "./frontmatterRewriter";
import {
  addFlatRefToFrontmatter,
  removeFlatRefFromFrontmatter,
} from "./flatRefRewriter";

// AnyRefField is the union of object-ref fields (RefType) and the flat-array
// field. It lives in refGraph.ts (the types home) to keep this module free of
// a circular import; re-exported here for callers that reach the field union
// through the store.
export type { AnyRefField };

const FLAT_FIELDS: ReadonlySet<string> = new Set(["relatedComponents"]);

export function isFlatField(field: AnyRefField): boolean {
  return FLAT_FIELDS.has(field);
}

export interface RefStore {
  addRef(field: AnyRefField, slug: string, note: string | null): string;
  removeRef(field: AnyRefField, slug: string): string;
}

/**
 * Stateful RefStore bound to a markdown source string.
 * Each method returns a NEW source string; it does NOT mutate in place.
 */
export class FrontmatterRefStore implements RefStore {
  constructor(private readonly source: string) {}

  addRef(field: AnyRefField, slug: string, note: string | null): string {
    if (isFlatField(field)) {
      return addFlatRefToFrontmatter(this.source, field, slug);
    }
    return addRefToFrontmatter(this.source, field as RefType, { slug, note });
  }

  removeRef(field: AnyRefField, slug: string): string {
    if (isFlatField(field)) {
      return removeFlatRefFromFrontmatter(this.source, field, slug);
    }
    return removeRefFromFrontmatter(this.source, field as RefType, slug);
  }
}

/** Map a Domain to its ref-field name. */
export function refFieldFor(domain: string): AnyRefField {
  switch (domain) {
    case "accessibility":
      return "a11y_refs";
    case "motion":
      return "motion_refs";
    case "foundations":
      return "foundations_refs";
    case "component":
      return "relatedComponents";
    case "content":
      // Content-topic cross-references are not yet wired to a persistent
      // field; map to relatedComponents as the closest analogue until the
      // content-refs schema lands.
      return "relatedComponents";
    default:
      throw new Error(`refFieldFor: unhandled domain "${domain}"`);
  }
}

/** True when a Domain's ref-field is a flat-array field (relatedComponents)
 *  rather than an object-ref block. Flat fields cannot carry a per-entry
 *  note, so the picker hides the note input for them (otherwise a typed note
 *  would be silently dropped on write). */
export function isFlatRefDomain(domain: string): boolean {
  return isFlatField(refFieldFor(domain));
}
