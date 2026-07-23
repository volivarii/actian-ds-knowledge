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
  /** Labels of the products that already depend on this record. */
  usedBy: string[];
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

export function listContextRecords(): ContextRecord[] {
  const index = bakedGraphIndex();
  const records: ContextRecord[] = [];

  for (const node of graphNodes) {
    const kind = KIND_BY_NODE_TYPE[node.type];
    if (!kind) continue;
    const slug = slugOf(node.id);
    const usedBy = index
      .neighbors(node.id, { edgeTypes: ["in_app"], direction: "out" })
      .map((n) => n.node?.title)
      .filter((title): title is string => Boolean(title))
      .sort((a, b) => a.localeCompare(b));
    records.push({
      kind,
      slug,
      label: node.title,
      path: `app-context/src/${DIR_BY_KIND[kind]}/${slug}.md`,
      usedBy,
    });
  }

  return records.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label),
  );
}
