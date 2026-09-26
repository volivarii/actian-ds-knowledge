// The component page's connections: _meta.yml as loaded and as drafted, plus
// its guidance text. `tick` re-reads after a batch change (pass the cart
// entries), so a staged edit shows as pending.
import { useEffect, useState } from "react";
import type { Octokit } from "@octokit/rest";
import { readMetaForConnections } from "../../lib/workspaceState";
import { bakedGraphIndex } from "../../substrate/graphIndex";
import { buildConnections } from "../../lib/connections/build";
import { ownedValues } from "../../lib/connections/owned";
import type { ConnectionsModel } from "../../lib/connections/types";

export function useComponentConnections(
  gh: Octokit,
  slug: string,
  tick: unknown,
): { model: ConnectionsModel; original: Record<string, unknown> } | null {
  const [state, setState] = useState<{ model: ConnectionsModel; original: Record<string, unknown> } | null>(null);
  useEffect(() => {
    let live = true;
    readMetaForConnections(gh, slug)
      .then((r) => {
        if (!live) return;
        setState({
          original: r.original,
          model: buildConnections({
            nodeId: `component:${slug}`,
            index: bakedGraphIndex(),
            original: ownedValues("component", r.original),
            live: ownedValues("component", r.live),
            bodies: r.bodies,
          }),
        });
      })
      .catch(() => {
        // Unreadable _meta.yml: fall back to the graph, read-only.
        if (live)
          setState({
            original: {},
            model: buildConnections({ nodeId: `component:${slug}`, index: bakedGraphIndex() }),
          });
      });
    return () => {
      live = false;
    };
  }, [gh, slug, tick]);
  return state;
}
