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

import type { RefType } from "./refGraph";
import {
  addRefToFrontmatter,
  removeRefFromFrontmatter,
} from "./frontmatterRewriter";
import {
  addFlatRefToFrontmatter,
  removeFlatRefFromFrontmatter,
} from "./flatRefRewriter";

/** All ref-field names the editor can write. Object-ref fields live in
 *  RefType; flat-array fields are enumerated here as a union extension. */
export type AnyRefField = RefType | "relatedComponents";

const FLAT_FIELDS: ReadonlySet<string> = new Set(["relatedComponents"]);

function isFlatField(field: AnyRefField): boolean {
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
