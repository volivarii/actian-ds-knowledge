// Data for the inline reference hover-preview card.
//
// Resolves a component slug (the value an inline typed link carries in data-ref)
// to a richer preview than the bare type tooltip: the cleaned title, the type,
// its category, and how many components/patterns use it — all from the baked
// graph, so it is synchronous and consumer-free. Returns null for anything that
// is not a real component node (mirrors resolveReference). The editor has no
// per-component prose description baked in, so "context" here is graph-derived;
// a real blurb would need component descriptions wired into the editor.
import { graphNodes } from "../substrate/taxonomyAssets";
import { bakedGraphIndex } from "../substrate/graphIndex";

export interface ReferenceCardData {
  title: string;
  type: string;
  /** The component's category title, or null if none. */
  category: string | null;
  /** How many components/patterns use this component. */
  usedBy: number;
}

/** Strip a leading Figma status marker (e.g. "✍️ Table" -> "Table"); any
 *  leading run of non-letter/non-number characters. Falls back to the trimmed
 *  original if stripping would empty it. */
function cleanTitle(t: string): string {
  const stripped = t.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  return stripped || t.trim();
}

let _byId: Map<string, { id: string; type: string; title: string }> | null =
  null;
function byId(): Map<string, { id: string; type: string; title: string }> {
  return (_byId ??= new Map(graphNodes.map((n) => [n.id, n])));
}

export function referenceCardData(slug: string): ReferenceCardData | null {
  const id = "component:" + slug;
  const node = byId().get(id);
  if (!node) return null;
  const index = bakedGraphIndex();
  const cat = index.neighbors(id, {
    edgeTypes: ["in_category"],
    direction: "out",
  })[0];
  const usedBy = index
    .neighbors(id, { direction: "in" })
    .filter(
      (n) => n.edgeType === "composed_of" || n.edgeType === "uses_component",
    ).length;
  return {
    title: cleanTitle(node.title),
    type: node.type,
    category: cat?.node ? cleanTitle(cat.node.title) : null,
    usedBy,
  };
}
