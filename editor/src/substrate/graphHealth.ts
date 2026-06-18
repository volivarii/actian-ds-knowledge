// Relationship-health data for the Relationships tab. Scalar metrics come from
// the CI-emitted graph/dist/quality-report.json (coverage/integrity/
// connectivity). Per-node hub & orphan rows are derived live from the
// asset-free eligible index (the report has no per-node breakdown). Browser-
// safe: a static JSON import + pure functions; never node:fs.
import qualityReportRaw from "../../../graph/dist/quality-report.json";
import type { GraphIndex } from "./graphIndex";
import {
  eligibleSubset,
  eligibleGraphIndex,
  type GraphSubset,
} from "./graphEligibility";

export interface QualityMetric {
  dimension: string;
  metric: string;
  value: number;
  timestamp: string | null;
  severity: string;
}

export const qualityReport: QualityMetric[] = qualityReportRaw as QualityMetric[];

export function metricsByDimension(
  report: QualityMetric[],
  dimension: string,
): QualityMetric[] {
  return report.filter((m) => m.dimension === dimension);
}

export interface HubRow {
  id: string;
  title: string;
  type: string;
  degree: number;
}

/** Highest-degree eligible nodes (in+out), id-sorted tiebreak, capped. */
export function topHubs(
  subset: GraphSubset = eligibleSubset(),
  index: GraphIndex = eligibleGraphIndex(),
  limit = 10,
): HubRow[] {
  return subset.nodes
    .map((n) => ({
      id: n.id,
      title: n.title,
      type: n.type,
      degree: index.degIn(n.id) + index.degOut(n.id),
    }))
    .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export interface OrphanRow {
  id: string;
  title: string;
  type: string;
}

/** Eligible nodes with zero edges in the eligible subgraph, title-sorted. */
export function orphanRows(
  subset: GraphSubset = eligibleSubset(),
  index: GraphIndex = eligibleGraphIndex(),
): OrphanRow[] {
  const orphanSet = new Set(index.orphans());
  return subset.nodes
    .filter((n) => orphanSet.has(n.id))
    .map((n) => ({ id: n.id, title: n.title, type: n.type }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
