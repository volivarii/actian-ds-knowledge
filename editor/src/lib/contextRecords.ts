// The application-context records a new product can reuse: the entities and
// features already authored, each with the products that depend on them.
//
// Read from the baked graph, so this is "as of the last merge" like every
// other graph-derived surface in the editor. A record authored in an open PR
// is not here yet, and the UI says so rather than pretending to be live.

import { graphNodes } from "../substrate/taxonomyAssets";
import { bakedGraphIndex } from "../substrate/graphIndex";

export interface ContextRecord {
  kind: "entity" | "feature";
  slug: string;
  label: string;
  /** Authorable source file. */
  path: string;
  /** Labels of the products that already depend on this record, for display. */
  usedBy: string[];
  /** The same products as slugs. Comparisons must use these: labels are not
   *  unique, so matching on them can mark the wrong product. */
  usedBySlugs: string[];
  /** True when the record exists only as a staged file in the current batch. */
  pending?: boolean;
}

const KIND_BY_NODE_TYPE: Record<string, "entity" | "feature"> = {
  app_entity: "entity",
  ux_pattern: "feature",
};

const DIR_BY_KIND: Record<"entity" | "feature", string> = {
  entity: "entities",
  feature: "patterns",
};

/** Strips the `entity:` / `pattern:` node-id prefix. */
function slugOf(nodeId: string): string {
  const colon = nodeId.indexOf(":");
  return colon === -1 ? nodeId : nodeId.slice(colon + 1);
}

export interface GraphPick {
  slug: string;
  label: string;
}

/** Products as the last merged graph knows them; the caller merges in any
 *  product created since (a just-staged one is not in the baked graph). */
export function listProducts(): GraphPick[] {
  return graphNodes
    .filter((n) => n.type === "app")
    .map((n) => ({ slug: slugOf(n.id), label: n.title }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Entities an entity can point at, as of the last merge.
 *
 *  Read from the baked graph like `listProducts` above, and with the same
 *  limitation: an entity created in the current batch is NOT here yet. The
 *  caller must not present absence from this list as an authoring error, only
 *  as absence from the published set, or it reports a red state for a record
 *  the author has legitimately just created. */
export function listEntities(): GraphPick[] {
  return graphNodes
    .filter((n) => n.type === "app_entity")
    .map((n) => ({ slug: slugOf(n.id), label: n.title }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** DS components a feature can declare it composes. */
export function listComponents(): GraphPick[] {
  return graphNodes
    .filter((n) => n.type === "component")
    .map((n) => ({ slug: slugOf(n.id), label: n.title }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function listContextRecords(): ContextRecord[] {
  const index = bakedGraphIndex();
  const records: ContextRecord[] = [];

  for (const node of graphNodes) {
    const kind = KIND_BY_NODE_TYPE[node.type];
    if (!kind) continue;
    const slug = slugOf(node.id);
    // Fall back to the slug when an edge points at an app node the graph does
    // not carry a title for. Dropping it instead would quietly under-report who
    // depends on this record, which is the one thing the disclosure must get
    // right.
    const products = index
      .neighbors(node.id, { edgeTypes: ["in_app"], direction: "out" })
      .map((n) => ({ slug: slugOf(n.id), label: n.node?.title || slugOf(n.id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    records.push({
      kind,
      slug,
      label: node.title,
      path: `app-context/src/${DIR_BY_KIND[kind]}/${slug}.md`,
      usedBy: products.map((p) => p.label),
      usedBySlugs: products.map((p) => p.slug),
    });
  }

  return records.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label),
  );
}
