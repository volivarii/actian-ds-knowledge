import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gapCount,
  topGaps,
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

test("topGaps ranks authored usage gaps first, then other authored gaps, then ghosts", () => {
  const rows = [
    row("alert", "unstarted"), // registry ghost, last whatever its name
    row("zeta", "authored", { tokens: "not-started" }), // other gap, middle
    row("button", "authored", { usage: "not-started" }), // usage gap, first
  ];
  const gaps = topGaps(rows, 10);
  assert.deepEqual(
    gaps.map((g: AttentionItem) => g.slug),
    ["button", "zeta", "alert"],
  );
  // "alert" sorts before both of the others alphabetically, so a ghost losing
  // to "zeta" is the band doing the work rather than the tiebreak.
  assert.deepEqual(
    gaps.map((g) => g.band),
    [0, 1, 2],
  );
});

test("topGaps never lets a ghost outrank an authored component", () => {
  // Measured on the real substrate, ghosts in the middle band emptied the
  // list: of 74 registry components 0 had a usage gap, 31 were ghosts and 43
  // were authored with some other gap, so a list of eight showed eight
  // alphabetically-first ghosts, five empty cells each, and none of the 43
  // rows that differ from one another. Enough ghosts to fill the limit, and
  // every one of them alphabetically ahead of the authored row.
  const rows = [
    ...["aaa", "aab", "aac", "aad"].map((s) => row(s, "unstarted")),
    row("zzz", "authored", { tokens: "not-started" }),
  ];
  const gaps = topGaps(rows, 4);
  assert.equal(
    gaps[0]!.slug,
    "zzz",
    `ghosts crowded out the authored row: ${gaps.map((g) => g.slug).join(", ")}`,
  );
  assert.deepEqual(
    gaps.map((g) => g.band),
    [1, 2, 2, 2],
  );
});

test("gapCount counts rows with any not-started domain, without sorting", () => {
  const rows = [
    row("button", "authored"), // fully covered
    row("tabs", "authored", { usage: "not-started" }),
    row("alert", "unstarted"),
  ];
  assert.equal(gapCount(rows), 2);
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
