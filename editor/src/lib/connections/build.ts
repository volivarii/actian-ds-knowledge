// Build one record's connections: its own fields (editable when the screen
// passes the loaded and current values), every other graph neighbour grouped
// by kind, a component's category rules, and the links in its text. Each
// group says where its links are stored.
import type { GraphIndex } from "../../substrate/graphIndex";
import { graphNodes, graphEdges } from "../../substrate/taxonomyAssets";
import { cleanTitle } from "../referenceCard";
import type {
  ConnectionGroup,
  ConnectionItem,
  ConnectionsModel,
  ConnectOption,
  ItemState,
  OwnedField,
  OwnedValues,
  StoreKind,
} from "./types";
import {
  groupDef,
  inheritedGroupDef,
  MENTIONED_GROUP,
  NAMED_GROUP,
  storeFor,
  whereFor,
  groupRank,
  fillName,
  verbPhrase,
  type GroupDef,
} from "./vocabulary";
import { OWNED, recordKindOf, nodeIdFor, slugOfId, fieldKey } from "./owned";
import { linkedSlugs, codeMentions } from "./bodyLinks";

export interface BuildInput {
  nodeId: string;
  index: GraphIndex;
  /** Owned values in the file as loaded. Omit on read-only surfaces. */
  original?: OwnedValues | null;
  /** Owned values in the current draft. Omit on read-only surfaces. */
  live?: OwnedValues | null;
  /** Text read for links (component page: its domain files; other records: their body). */
  bodies?: Array<{ path: string; text: string }>;
  /** Fallback name when the node is not in the graph yet (a new record). */
  name?: string;
  /** Notes on the refs in the current draft, from `ownedNotes`. */
  notes?: Record<string, string>;
}

const REF_EDGES = new Set(["a11y_ref", "foundations_ref", "motion_ref"]);

function item(
  groupKey: string,
  slug: string,
  type: string,
  index: GraphIndex,
  state: ItemState,
  source: StoreKind,
): ConnectionItem {
  const nodeId = nodeIdFor(type, slug);
  const node = index.node(nodeId);
  return {
    key: `${groupKey}|${slug}`,
    slug,
    nodeId: node ? nodeId : null,
    title: node ? cleanTitle(node.title) : slug,
    type: node ? node.type : "unknown",
    // A saved slug with no graph node is flagged, never shown as pending.
    state: node || state !== "saved" ? state : "notInGraph",
    reciprocal: null,
    unlinked: false,
    source,
    status: "confirmed",
  };
}

export function buildConnections(input: BuildInput): ConnectionsModel {
  const { nodeId, index } = input;
  const focus = index.node(nodeId);
  const name = focus ? cleanTitle(focus.title) : (input.name ?? slugOfId(nodeId));
  const type = focus?.type ?? "unknown";
  const kind = recordKindOf(nodeId);
  const owned = (kind && OWNED[kind]) || [];
  const editable = input.original != null && input.live != null;
  const groups = new Map<string, ConnectionGroup>();

  const group = (d: GroupDef, direction: "out" | "in", store: StoreKind, where: string, ownedFields: OwnedField[] = []) => {
    let g = groups.get(d.key);
    if (!g) {
      g = {
        key: d.key,
        label: d.label,
        sentence: fillName(d.sentence, name),
        phrase: fillName(d.phrase, name),
        direction,
        store,
        where,
        editable: store === "here" && editable,
        owned: store === "here" ? ownedFields : [],
        items: [],
      };
      groups.set(d.key, g);
    }
    return g;
  };
  const push = (g: ConnectionGroup, it: ConnectionItem) => {
    if (!g.items.some((x) => x.slug === it.slug)) g.items.push(it);
  };

  // 1. The record's own fields.
  const ownedKey = (f: OwnedField) => groupDef(f.edgeType, "out", f.predicate)!.key;
  const connect: ConnectOption[] = [];
  for (const f of owned) {
    const d = groupDef(f.edgeType, "out", f.predicate)!;
    const siblings = owned.filter((o) => ownedKey(o) === d.key);
    if (!connect.some((c) => c.groupKey === d.key))
      connect.push({ groupKey: d.key, label: d.label, sentence: fillName(d.sentence, name), owned: siblings });
    const g = group(d, "out", "here", "this record", siblings);
    if (editable) {
      const k = fieldKey(f.field);
      const was = input.original![k] ?? [];
      const now = input.live![k] ?? [];
      for (const s of now) {
        const it = item(d.key, s, f.type, index, was.includes(s) ? "saved" : "added", "here");
        const note = input.notes?.[`${k}|${s}`];
        push(g, note ? { ...it, note } : it);
      }
      for (const s of was) if (!now.includes(s)) push(g, item(d.key, s, f.type, index, "removed", "here"));
    } else {
      for (const n of index.neighbors(nodeId, { direction: "out", edgeTypes: [f.edgeType] })) {
        if (f.predicate && !predicatesOf(nodeId, n.id, f.edgeType).includes(f.predicate)) continue;
        if (!n.node) continue;
        push(g, item(d.key, slugOfId(n.id), n.node.type, index, "saved", "here"));
      }
    }
  }
  const ownedEdgeTypes = new Set(owned.map((f) => f.edgeType));

  // 2. Every other neighbour.
  const outTargets = new Map<string, ConnectionItem>();
  for (const g of groups.values()) for (const i of g.items) if (i.nodeId) outTargets.set(i.nodeId, i);
  // The index returns one neighbour per edge, so two entities linked twice
  // (data-process consumes and produces Dataset) come back twice; each
  // occurrence takes the next predicate of that pair.
  const occurrence = new Map<string, number>();
  for (const n of index.neighbors(nodeId, { direction: "both" })) {
    if (n.direction === "out" && ownedEdgeTypes.has(n.edgeType)) continue;
    const preds =
      n.direction === "out" ? predicatesOf(nodeId, n.id, n.edgeType) : predicatesOf(n.id, nodeId, n.edgeType);
    const seen = `${n.direction}|${n.edgeType}|${n.id}`;
    const k = occurrence.get(seen) ?? 0;
    occurrence.set(seen, k + 1);
    const pred = preds[k] ?? preds[0];
    if (n.edgeType === "entity_related" && n.direction === "in" && outTargets.has(n.id)) {
      const target = outTargets.get(n.id)!;
      target.reciprocal ??= `${target.title} says it ${verbPhrase(pred ?? "relatesTo")} ${name}.`;
      continue;
    }
    const d = groupDef(n.edgeType, n.direction, pred);
    if (!d || !n.node) continue;
    const store = storeFor(n.edgeType, n.direction);
    const g = group(d, n.direction, store, whereFor(n.edgeType, n.direction));
    push(g, item(d.key, slugOfId(n.id), n.node.type, index, "saved", store));
  }

  // 3. A component's category rules.
  if (kind === "component") {
    const cat = index.neighbors(nodeId, { direction: "out", edgeTypes: ["in_category"] })[0];
    if (cat?.node) {
      const catTitle = cleanTitle(cat.node.title);
      const d = inheritedGroupDef(catTitle);
      for (const n of index.neighbors(cat.id, { direction: "out" })) {
        if (!REF_EDGES.has(n.edgeType) || !n.node) continue;
        const g = group(d, "out", "inherited", `the ${catTitle} category`);
        push(g, item(d.key, slugOfId(n.id), n.node.type, index, "saved", "inherited"));
      }
    }
  }

  // 4. Links and mentions in the text.
  const text = (input.bodies ?? []).map((b) => b.text).join("\n");
  if (text) {
    const files = (input.bodies ?? []).map((b) => b.path.split("/").pop()).join(", ");
    const linked = linkedSlugs(text);
    if (kind !== "pattern" && kind !== "entity" && linked.length) {
      const g = group(MENTIONED_GROUP, "out", "text", files);
      for (const s of linked) push(g, item(MENTIONED_GROUP.key, s, "component", index, "saved", "text"));
    }
    if (kind === "pattern") {
      const self = slugOfId(nodeId);
      const patterns = new Set(allSlugs("pattern:").filter((s) => s !== self));
      const named = codeMentions(text, patterns);
      if (named.length) {
        const g = group(NAMED_GROUP, "out", "text", files);
        for (const s of named)
          push(g, { ...item(NAMED_GROUP.key, s, "ux_pattern", index, "saved", "text"), unlinked: true });
      }
    }
  }

  const ordered = [...groups.values()]
    .filter((g) => g.items.length > 0)
    .sort((a, b) => groupRank(a.key) - groupRank(b.key));
  return { nodeId, name, type, groups: ordered, connect };
}

/** Links that exist or will exist: not removed, not a mere mention. */
export function countConnections(model: ConnectionsModel): number {
  return model.groups.reduce((n, g) => n + g.items.filter((i) => i.state !== "removed" && !i.unlinked).length, 0);
}

// GraphIndex exposes neither the full node list nor edge predicates, so these
// two read the baked arrays directly.
let _pred: Map<string, string[]> | null = null;
function edgePredicates(): Map<string, string[]> {
  if (_pred) return _pred;
  _pred = new Map();
  for (const e of graphEdges) {
    if (e.type !== "entity_related" || !e.predicate) continue;
    const k = `${e.source}|${e.target}`;
    _pred.set(k, [...(_pred.get(k) ?? []), e.predicate]);
  }
  return _pred;
}
/** Every predicate of the entity relations from source to target, in graph order. */
function predicatesOf(source: string, target: string, edgeType: string): string[] {
  if (edgeType !== "entity_related") return [];
  return edgePredicates().get(`${source}|${target}`) ?? [];
}
function allSlugs(prefix: string): string[] {
  return graphNodes.filter((n) => n.id.startsWith(prefix)).map((n) => slugOfId(n.id));
}
