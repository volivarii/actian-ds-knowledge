// The Connections model: what a record links to and what links to it, grouped
// by kind, each group saying where its links are stored.

/** Where a group's links are stored, which decides whether they can be changed here. */
export type StoreKind =
  | "here" // a field of the open record
  | "figma" // Figma sync (composed_of, in_category)
  | "other" // a field of the other record
  | "inherited" // the component's category
  | "text" // a link in the guidance text
  | "inferred" // a name match at build time
  | "structure"; // the foundations tree

export type ItemState = "saved" | "added" | "removed" | "notInGraph";

export interface ConnectionItem {
  /** Stable within a record: `${groupKey}|${slug}`. */
  key: string;
  slug: string;
  nodeId: string | null;
  title: string;
  /** Graph node type, or "unknown" when the slug is not a graph node. */
  type: string;
  state: ItemState;
  /** Set when the other record declares the same link: "Domain says it contains Catalog Object." */
  reciprocal: string | null;
  /** A code-style mention in the text, not a link. Not counted. */
  unlinked: boolean;
  /** Per link, for a future curation layer; equals the group's store today. */
  source: StoreKind;
  status: "confirmed";
}

/** A frontmatter field an edit may write. */
export interface OwnedField {
  edgeType: string;
  /** entity_related only. */
  predicate?: string;
  /** Path in the record's data, e.g. ["relationships", "contains"]. */
  field: string[];
  /** Graph node type of the values. */
  type: string;
  /** "ref" writes `{ ref: slug }`, "slug" writes the bare slug. */
  shape: "slug" | "ref";
}

export interface ConnectionGroup {
  key: string;
  label: string;
  /** One sentence, the record's name already filled in. */
  sentence: string;
  /** The panel's sentence for one link, `{other}` still to fill: "Button must follow {other}." */
  phrase: string;
  direction: "out" | "in";
  store: StoreKind;
  /** Plain description of the storage place, for the panel. */
  where: string;
  editable: boolean;
  /** Fields an add may write (several for "Must follow"). Empty when not editable. */
  owned: OwnedField[];
  items: ConnectionItem[];
}

/** An editable kind of connection offered by "+ Connect", even when it has no items yet. */
export interface ConnectOption {
  groupKey: string;
  label: string;
  sentence: string;
  owned: OwnedField[];
}

export interface ConnectionsModel {
  nodeId: string;
  name: string;
  type: string;
  groups: ConnectionGroup[];
  connect: ConnectOption[];
}

export interface ConnectionEdit {
  op: "add" | "remove";
  field: string[];
  slug: string;
  shape: "slug" | "ref";
}

/** Owned field values keyed by `field.join(".")`. */
export type OwnedValues = Record<string, string[]>;
