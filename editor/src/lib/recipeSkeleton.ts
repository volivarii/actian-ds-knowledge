// Reads a captured recipe's skeleton as an OUTLINE: node types, node names,
// the words a TEXT node recorded, and a size where one is declared.
//
// This is deliberately NOT a renderer. Painting a skeleton means walking the
// same FRAME/TEXT/INSTANCE tree into markup, which is `render-node.js` and
// belongs to the plugin (see SEAM.md). Reading the names off the tree is a
// different job with a different output, and the reviewable substance of a
// recipe (its slots, its render notes, its when clause) is prose that needs
// neither. Painting stays a separate, later decision.
//
// Every branch here tolerates a shape the schema permits but a capture may not
// carry. A reader opens a recipe BECAUSE it may be incomplete, so a walker that
// throws on a missing field takes down the one view that would have shown the
// gap.

/** One property an INSTANCE sets on the component it instantiates. */
export interface OutlinePropValue {
  name: string;
  value: string;
}

export interface OutlineNode {
  /** The node's declared type, or "UNKNOWN" when it declares none. */
  type: string;
  /** Null rather than a stand-in: an invented name is a word not in the substrate. */
  name: string | null;
  /** The words a TEXT node recorded, where it has any. */
  text: string | null;
  /** A declared size as one readable pair, e.g. "550 x FILL". */
  size: string | null;
  /**
   * For an INSTANCE, the component it instantiates. This is where a capture
   * touches the design system, and no instance node in the captures carries a
   * `name`, so without this an instance row reads as a bare repeated word.
   */
  ref: string | null;
  /** The instantiated variant, e.g. "Style=Light". */
  variant: string | null;
  /**
   * The properties an INSTANCE sets, which is where the page's words live for
   * the 49 of 73 instance nodes that carry them: `fmTabs` keeps its tab labels
   * here the way a TEXT node keeps its string in `content`.
   */
  props: OutlinePropValue[];
  children: OutlineNode[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A string, or null for anything else. Numbers are not names or content. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * "550 x FILL". A dimension may be a number (a fixed px) or a string (FILL,
 * HUG). "auto" stands for a dimension the node leaves undeclared, which is a
 * fact about the capture rather than an invented value.
 */
function toSize(sizing: unknown): string | null {
  if (!isRecord(sizing)) return null;
  const dim = (v: unknown): string | null =>
    typeof v === "number" ? String(v) : str(v);
  const h = dim(sizing.horizontal);
  const v = dim(sizing.vertical);
  if (h === null && v === null) return null;
  return `${h ?? "auto"} x ${v ?? "auto"}`;
}

/**
 * Prop values are read whatever their type: the schema does not constrain them,
 * and a row that renders nothing is the failure this field exists to fix. A
 * `props` that is not an object reads as no props rather than throwing.
 */
function toProps(props: unknown): OutlinePropValue[] {
  if (!isRecord(props)) return [];
  return Object.entries(props).map(([name, value]) => ({
    name,
    value: typeof value === "string" ? value : JSON.stringify(value) ?? "",
  }));
}

function toNode(raw: Record<string, unknown>): OutlineNode {
  return {
    type: str(raw.type) ?? "UNKNOWN",
    name: str(raw.name),
    text: str(raw.content),
    size: toSize(raw.sizing),
    ref: str(raw.ref),
    variant: str(raw.variant),
    props: toProps(raw.props),
    children: toSkeletonOutline(raw.children),
  };
}

/**
 * Walks a skeleton branch into an outline. Anything that is not a list of
 * objects reads as no children: a non-object entry is skipped and its siblings
 * survive, because dropping one malformed node is recoverable and dropping the
 * whole page is not.
 */
export function toSkeletonOutline(content: unknown): OutlineNode[] {
  if (!Array.isArray(content)) return [];
  return content.filter(isRecord).map(toNode);
}

/**
 * Total nodes at every depth. The panel collapses the skeleton by default, so
 * this count is all a reader sees before deciding to expand it: a top-level
 * count would understate a real capture by an order of magnitude.
 */
export function countOutlineNodes(nodes: OutlineNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countOutlineNodes(node.children), 0);
}
