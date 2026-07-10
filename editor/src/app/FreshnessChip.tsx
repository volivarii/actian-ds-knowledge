// Quiet always-visible freshness signal in the app header: knowledge
// version + when the substrate last changed ("honest status, always
// visible"). Renders nothing while loading or when both probes fail —
// a freshness chip must never show stale or made-up freshness. The
// relative label re-derives every minute so the chip itself can't go
// stale while the app stays open.

import { useEffect, useState } from "react";
import type { Octokit } from "@octokit/rest";
import { Badge, Tooltip } from "@radix-ui/themes";
import { formatRelativeTime } from "../lib/derivedFields";
import { loadFreshness, type Freshness } from "../lib/freshness";

export interface FreshnessChipProps {
  octokit: Octokit;
}

export function FreshnessChip({ octokit }: FreshnessChipProps) {
  const [freshness, setFreshness] = useState<Freshness | null>(null);
  const [now, setNow] = useState(() => Date.now());

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

  // Minute tick so "updated Nm ago" keeps counting without a refetch.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!freshness || (freshness.version == null && freshness.updatedAt == null))
    return null;

  const parts: string[] = [];
  if (freshness.version) parts.push(`v${freshness.version}`);
  if (freshness.updatedAt)
    parts.push(`updated ${formatRelativeTime(freshness.updatedAt, now)}`);
  const label = parts.join(" · ");

  const detail = freshness.updatedAt
    ? `The knowledge substrate last changed ${formatRelativeTime(freshness.updatedAt, now)} (${freshness.updatedAt.slice(0, 10)}). Data views are as of the last merge.`
    : "Knowledge version from main. Data views are as of the last merge.";

  return (
    <Tooltip content={detail}>
      <Badge
        variant="soft"
        color="gray"
        size="1"
        tabIndex={0}
        aria-label={`${label}. ${detail}`}
      >
        {label}
      </Badge>
    </Tooltip>
  );
}
