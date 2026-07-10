import { test } from "node:test";
import assert from "node:assert/strict";
import {
  topGaps,
  usageGapCount,
  type AttentionItem,
} from "../../src/lib/needsAttention";
import type {
  CoverageRow,
  Domain,
  DomainEntry,
  Status,
} from "../../src/lib/coverageLoader";

function domains(
  overrides: Partial<Record<Domain, Status>> = {},
): Record<Domain, DomainEntry> {
  const base: Record<Domain, DomainEntry> = {
    content: { status: "approved" },
    usage: { status: "approved" },
    design: { status: "approved" },
    behavior: { status: "approved" },
    tokens: { status: "approved" },
  };
  for (const [d, s] of Object.entries(overrides)) {
    base[d as Domain] = { status: s as Status };
  }
  return base;
}

function row(
  slug: string,
  origin: CoverageRow["origin"],
  overrides: Partial<Record<Domain, Status>> = {},
): CoverageRow {
  return {
    slug,
    component: slug.charAt(0).toUpperCase() + slug.slice(1),
    domains:
      origin === "unstarted"
        ? domains({
            content: "not-started",
            usage: "not-started",
            design: "not-started",
            behavior: "not-started",
            tokens: "not-started",
          })
        : domains(overrides),
    a11yRefs: [],
    origin,
  };
}

test("usageGapCount counts rows whose usage is not-started, any origin", () => {
  const rows = [
    row("button", "authored", { usage: "not-started" }),
    row("tabs", "authored", { usage: "draft" }),
    row("card", "authored", { usage: "inherited" }),
    row("dialog", "unstarted"),
  ];
  assert.equal(usageGapCount(rows), 2);
});

test("topGaps ranks authored usage gaps first, then unstarted, then other authored gaps", () => {
  const rows = [
    row("zeta", "authored", { tokens: "not-started" }), // other gap → last
    row("alert", "unstarted"), // ghost → middle
    row("button", "authored", { usage: "not-started" }), // usage gap → first
  ];
  const gaps = topGaps(rows, 10);
  assert.deepEqual(
    gaps.map((g: AttentionItem) => g.slug),
    ["button", "alert", "zeta"],
  );
});

test("topGaps sorts alphabetically within a priority band and respects the limit", () => {
  const rows = [
    row("tabs", "authored", { usage: "not-started" }),
    row("badge", "authored", { usage: "not-started" }),
    row("menu", "authored", { usage: "not-started" }),
  ];
  const gaps = topGaps(rows, 2);
  assert.deepEqual(
    gaps.map((g) => g.slug),
    ["badge", "menu"],
  );
});

test("topGaps excludes fully covered rows and lists missing domains", () => {
  const rows = [
    row("button", "authored"), // fully covered → excluded
    row("tabs", "authored", { usage: "not-started", tokens: "not-started" }),
  ];
  const gaps = topGaps(rows, 10);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0]!.slug, "tabs");
  assert.deepEqual(gaps[0]!.missing, ["usage", "tokens"]);
  assert.equal(gaps[0]!.target, "workspace/tabs");
});

test("inherited and draft statuses are not gaps", () => {
  const rows = [
    row("card", "authored", {
      usage: "inherited",
      content: "draft",
      design: "inherited",
    }),
  ];
  assert.deepEqual(topGaps(rows, 10), []);
});
