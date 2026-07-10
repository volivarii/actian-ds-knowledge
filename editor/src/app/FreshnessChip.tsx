// Quiet always-visible freshness signal in the app header: knowledge
// version + when the substrate last changed ("honest status, always
// visible"). Renders nothing while loading or when both probes fail —
// a freshness chip must never show stale or made-up freshness.

import { useEffect, useState } from "react";
import type { Octokit } from "@octokit/rest";
import { Badge, Tooltip } from "@radix-ui/themes";
import { formatAgo, loadFreshness, type Freshness } from "../lib/freshness";

export interface FreshnessChipProps {
  octokit: Octokit;
}

export function FreshnessChip({ octokit }: FreshnessChipProps) {
  const [freshness, setFreshness] = useState<Freshness | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFreshness(octokit).then(
      (f) => {
        if (!cancelled) setFreshness(f);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [octokit]);

  if (!freshness || (freshness.version == null && freshness.updatedAt == null))
    return null;

  const parts: string[] = [];
  if (freshness.version) parts.push(`v${freshness.version}`);
  if (freshness.updatedAt)
    parts.push(`updated ${formatAgo(Date.now(), freshness.updatedAt)}`);

  return (
    <Tooltip
      content={
        freshness.updatedAt
          ? `Knowledge last changed ${freshness.updatedAt} (last version bump on main). Relations and graph data are as of the last merge.`
          : "Knowledge version from main. Relations and graph data are as of the last merge."
      }
    >
      <Badge variant="soft" color="gray" size="1">
        {parts.join(" · ")}
      </Badge>
    </Tooltip>
  );
}
