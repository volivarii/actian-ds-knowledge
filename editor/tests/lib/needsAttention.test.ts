import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backlogSentence,
  backlogShape,
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
  // The band rides on each item — it is the single source of truth for
  // both the ordering above and the action label the UI shows.
  assert.deepEqual(
    gaps.map((g) => g.band),
    [0, 1, 2],
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

test("backlogShape tells an unstarted component apart from a missing domain", () => {
  // Measured over everything, the sentence read "Tokens is the backlog: 73 of
  // 85" while the list beneath it showed eight components with nothing
  // authored at all. A component nobody has started is missing all five
  // domains, not one, and folding the two together made every domain look
  // equally bad.
  const rows: CoverageRow[] = [
    row("started-a", "authored", {
      design: "inherited",
      behavior: "inherited",
      tokens: "not-started",
    }),
    row("started-b", "authored", {
      design: "inherited",
      behavior: "inherited",
      tokens: "not-started",
    }),
    row("ghost", "unstarted"),
  ];
  const shape = backlogShape(rows);
  assert.equal(shape.unstarted, 1);
  assert.equal(shape.started, 2);
  assert.equal(shape.backlog?.domain, "tokens");
  // 2, not 3: the ghost is counted once as unstarted, never five times as a
  // per-domain gap.
  assert.equal(shape.backlog?.open, 2);
  assert.equal(shape.backlog?.total, 2);
});

test("backlogShape reports no backlog when every started component is underway", () => {
  const rows: CoverageRow[] = [
    row("done", "authored"),
  ];
  const shape = backlogShape(rows);
  assert.equal(shape.backlog, null, "a zero was reported as a backlog");
  assert.equal(shape.unstarted, 0);
});

test("backlogSentence never contradicts itself", () => {
  // Assembled inline from two independent ternaries, each correct on its own,
  // it read "2 components have no guidance at all. Nothing is unwritten." with
  // nothing started. No fixture in the suite had that shape.
  const nothingStarted = backlogSentence({
    unstarted: 2,
    started: 0,
    backlog: null,
  });
  assert.equal(nothingStarted, "2 components have no guidance at all.");
  assert.ok(
    !/nothing is unwritten|every domain/i.test(nothingStarted),
    `contradicts itself: ${nothingStarted}`,
  );
});

test("backlogSentence says both facts when both are true", () => {
  const both = backlogSentence({
    unstarted: 31,
    started: 54,
    backlog: { domain: "tokens", open: 42 },
  });
  assert.equal(
    both,
    "31 components have no guidance at all. Of the 54 started, Tokens is the backlog: 42 have none authored.",
  );
});

test("backlogSentence does not say 'the other' when there is no other", () => {
  assert.equal(
    backlogSentence({ unstarted: 0, started: 7, backlog: null }),
    "All 7 components have every domain underway.",
  );
  assert.equal(
    backlogSentence({ unstarted: 3, started: 7, backlog: null }),
    "3 components have no guidance at all. The other 7 have every domain underway.",
  );
});

test("backlogSentence counts one component in the singular", () => {
  assert.match(
    backlogSentence({ unstarted: 1, started: 0, backlog: null }),
    /^1 component has no guidance at all\.$/,
  );
});

test("backlogSentence on an empty substrate says nothing rather than a zero", () => {
  assert.equal(backlogSentence({ unstarted: 0, started: 0, backlog: null }), "");
});
