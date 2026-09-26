// What the pending connection changes will write, as YAML lines under their
// field. Shown behind "Review the file change" so the author sees the PR.
import type { ConnectionsModel, OwnedField } from "./types";

export interface PreviewLine {
  indent: number;
  text: string;
  kind: "field" | "add" | "remove";
}

export function pendingCount(model: ConnectionsModel): number {
  return model.groups.reduce(
    (n, g) => n + g.items.filter((i) => i.state === "added" || i.state === "removed").length,
    0,
  );
}

export function pendingPreview(model: ConnectionsModel): PreviewLine[] {
  const byField = new Map<string, { field: OwnedField; add: string[]; remove: string[] }>();
  for (const g of model.groups) {
    if (!g.editable) continue;
    for (const i of g.items) {
      if (i.state !== "added" && i.state !== "removed") continue;
      // "Must follow" spans three fields; the item's type picks one. A slug
      // with no graph node has no type, and only single-field groups can hold one.
      const f = g.owned.find((o) => o.type === i.type) ?? g.owned[0];
      if (!f) continue;
      const k = f.field.join(".");
      const e = byField.get(k) ?? { field: f, add: [], remove: [] };
      (i.state === "added" ? e.add : e.remove).push(i.slug);
      byField.set(k, e);
    }
  }
  const lines: PreviewLine[] = [];
  const printed = new Set<string>();
  for (const [, e] of [...byField].sort(([a], [b]) => (a < b ? -1 : 1))) {
    e.field.field.forEach((part, depth) => {
      const path = e.field.field.slice(0, depth + 1).join(".");
      if (printed.has(path)) return;
      printed.add(path);
      lines.push({ indent: depth + 1, text: `${part}:`, kind: "field" });
    });
    const indent = e.field.field.length + 1;
    const fmt = (s: string) => (e.field.shape === "ref" ? `- { ref: ${s} }` : `- ${s}`);
    for (const s of e.remove) lines.push({ indent, text: fmt(s), kind: "remove" });
    for (const s of e.add) lines.push({ indent, text: fmt(s), kind: "add" });
  }
  return lines;
}
