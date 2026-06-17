// Static taxonomy bundle baked into the editor at build time.
//
// Each editor build snapshots the current a11y-index + motion patterns
// from the knowledge repo's dist/ artifacts; refreshing the taxonomy in
// the running editor requires rebuilding the editor (acceptable per the
// SPA deploy model — the knowledge repo and editor ship in lockstep).
//
// Vite imports JSON natively as the default export when `resolveJsonModule`
// is enabled in tsconfig.json (it is). Files are sibling-resolved
// from editor/src/substrate/ to the knowledge repo's dist artifacts.
//   ../../../accessibility/dist/a11y-index.json  → accessibility dist
//   ../../../foundations/dist/tokens/motion.json → motion dist
//   ../../../graph/dist/graph.json               → full substrate graph
import a11yIndexRaw from "../../../accessibility/dist/a11y-index.json";
import motionRaw from "../../../foundations/dist/tokens/motion.json";
import graphRaw from "../../../graph/dist/graph.json";

// We deliberately model the RAW shape here (matches what actually lands
// in dist/), not the loader's normalized internals. buildTaxonomyFromAssets
// is responsible for adapting body_excerpt → body and missing description
// → null without distorting the on-disk contract.
export interface A11ySectionRaw {
  slug: string;
  title: string;
  wcag?: string[];
  /** Real dist/a11y-index.json uses body_excerpt; test fixtures use body. */
  body?: string;
  body_excerpt?: string;
  /** foundation | component-pattern | checklist | header (from derive-a11y-index). */
  tier?: "foundation" | "component-pattern" | "checklist" | "header";
}

export interface MotionPatternRaw {
  slug: string;
  name: string;
  description?: string;
}

export interface A11yIndexRaw {
  _schema_version: number;
  sections: A11ySectionRaw[];
}

export interface MotionFileRaw {
  _schema_version: number;
  patterns: Record<string, MotionPatternRaw>;
}

export const a11yIndex = a11yIndexRaw as A11yIndexRaw;
export const motionPatterns = motionRaw as MotionFileRaw;

// ── Graph corpus ──────────────────────────────────────────────────────────────
// graph.json carries all substrate nodes (a11y_criterion, foundation_section,
// component, content_topic, motion_pattern, category). We extract subsets here
// so buildTaxonomyFromAssets can extend the Taxonomy without a runtime fetch.

export interface GraphNodeRaw {
  id: string;
  type: string;
  title: string;
  wcag?: string[];
}

export interface GraphFileRaw {
  nodes: GraphNodeRaw[];
}

const graph = graphRaw as GraphFileRaw;

/** Top-level foundation sections only (no `/` in slug) — these correspond to
 *  the entries authors reference in `foundations_refs` blocks. */
export const foundationSections: Array<{ slug: string; title: string }> =
  graph.nodes
    .filter(
      (n) =>
        n.type === "foundation_section" && !n.id.split(":")[1]?.includes("/"),
    )
    .map((n) => ({ slug: n.id.split(":")[1] ?? n.id, title: n.title }));

/** Component nodes from the graph corpus — used by the `component` domain
 *  picker to let content-file authors cross-reference DS components. */
export const componentNodes: Array<{ slug: string; title: string }> =
  graph.nodes
    .filter((n) => n.type === "component")
    .map((n) => ({ slug: n.id.split(":")[1] ?? n.id, title: n.title }));

/** Content-topic nodes from the graph corpus — used by the `content` domain.
 *  The graph uses the node type `content_topic` with id prefix `content:`. */
export const contentTopicNodes: Array<{ slug: string; title: string }> =
  graph.nodes
    .filter((n) => n.type === "content_topic")
    .map((n) => ({ slug: n.id.split(":")[1] ?? n.id, title: n.title }));
