// The bare slug of a graph node id (`component:button` -> `button`). Single
// source so every surface derives the data-ref the same way: the graph map
// nodes (GraphView), the relations-rail rows (RelationsPanel), and the value an
// inline typed link exposes (resolveReference returns the bare slug directly).
// Consistent derivation is what makes the cross-surface highlight match.
export function slugOfNodeId(id: string): string {
  const i = id.indexOf(":");
  return i === -1 ? id : id.slice(i + 1);
}
