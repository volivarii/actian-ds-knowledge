// The Coverage page's one sentence.
//
// What has to hold: it never states two counts for one thing (the screen used
// to open "85 components" while the sidebar beside it said 54), it leads with
// what is complete, and every branch produces a sentence a person can read.
// Assembled inline, the last sentence on this screen's sibling contradicted
// itself in production, so this one is pure and every branch is exercised.
import { test } from "node:test";
import assert from "node:assert/strict";
import { coverageSentence } from "../../src/lib/needsAttention";
import { DOMAINS } from "../../src/lib/workspaceState";
import type { CoverageRow, Status } from "../../src/lib/coverageLoader";

function row(
  slug: string,
  statuses: Partial<Record<string, Status>>,
  origin: CoverageRow["origin"] = "authored",
): CoverageRow {
  return {
    slug,
    component: slug.toUpperCase(),
    domains: Object.fromEntries(
      DOMAINS.map((d) => [d, { status: statuses[d] ?? "not-started" }]),
    ) as CoverageRow["domains"],
    a11yRefs: [],
    origin,
  };
}

const ALL: Partial<Record<string, Status>> = Object.fromEntries(
  DOMAINS.map((d) => [d, "approved"]),
);

test("coverageSentence: separates the authored count from the registry count", () => {
  const s = coverageSentence([
    row("a", ALL),
    row("b", ALL),
    row("ghost", {}, "unstarted"),
  ]);
  assert.match(
    s,
    /^2 components authored, 1 more in the registry with nothing yet\./,
  );
  // The defect this replaces: one number covering both, which then disagreed
  // with the sidebar's count of the authored set.
  assert.equal(
    /\b3 components\b/.test(s),
    false,
    `states a merged count: ${s}`,
  );
});

test("coverageSentence: with no ghosts it states one plain count", () => {
  const s = coverageSentence([row("a", ALL), row("b", ALL)]);
  assert.match(s, /^2 components\./);
  assert.equal(
    /registry/.test(s),
    false,
    `mentions a registry that is empty: ${s}`,
  );
});

test("coverageSentence: names the complete domains, and only those", () => {
  // content complete, usage complete, the rest not.
  const s = coverageSentence([
    row("a", { content: "approved", usage: "approved" }),
    row("b", { content: "draft", usage: "inherited" }),
  ]);
  assert.match(s, /Content and Usage are complete\./);
  assert.equal(/Tokens are complete|Design and/.test(s), false, s);
});

test("coverageSentence: one complete domain takes a singular verb", () => {
  const s = coverageSentence([row("a", { content: "approved" })]);
  assert.match(s, /Content is complete\./);
});

test("coverageSentence: three complete domains read as a list", () => {
  const s = coverageSentence([
    row("a", { content: "approved", usage: "approved", design: "inherited" }),
  ]);
  assert.match(s, /Content, Usage and Design are complete\./);
});

test("coverageSentence: names the largest gap against the authored total", () => {
  const s = coverageSentence([
    row("a", { content: "approved" }),
    row("b", { content: "approved" }),
    row("ghost", {}, "unstarted"),
  ]);
  // Four domains are unwritten on both rows; whichever it picks, the
  // denominator is the AUTHORED count, never 3.
  assert.match(s, / is the backlog: 2 of the 2 have none\./);
});

test("coverageSentence: a ghost row never makes a domain look incomplete", () => {
  const authoredOnly = coverageSentence([row("a", ALL)]);
  const withGhost = coverageSentence([
    row("a", ALL),
    row("g", {}, "unstarted"),
  ]);
  // The only difference the ghost may make is the count clause.
  assert.match(authoredOnly, /are complete\./);
  assert.match(withGhost, /are complete\./);
  assert.equal(
    /backlog/.test(withGhost),
    false,
    `a ghost created a backlog: ${withGhost}`,
  );
});

test("coverageSentence: everything complete says so without a backlog clause", () => {
  const s = coverageSentence([row("a", ALL), row("b", ALL)]);
  assert.equal(/backlog/.test(s), false, s);
  assert.equal(/underway/.test(s), false, s);
});

test("coverageSentence: nothing authored still reports the registry", () => {
  const s = coverageSentence([
    row("g", {}, "unstarted"),
    row("h", {}, "unstarted"),
  ]);
  assert.equal(
    s,
    "Nothing authored yet. 2 components in the registry are waiting.",
  );
  // Never "0 components", which reads as an empty design system.
  assert.equal(/^0 /.test(s), false, s);
});

test("coverageSentence: one waiting component is singular", () => {
  const s = coverageSentence([row("g", {}, "unstarted")]);
  // Written permissively at first, which passed on "1 component ... are
  // waiting". A guard that accepts both readings of the thing it exists to
  // check is not a guard.
  assert.equal(
    s,
    "Nothing authored yet. 1 component in the registry is waiting.",
  );
});

test("coverageSentence: an empty substrate says so rather than crashing", () => {
  assert.equal(coverageSentence([]), "No components found.");
});

test("coverageSentence: every branch ends in a full stop and has no double space", () => {
  const cases: CoverageRow[][] = [
    [],
    [row("g", {}, "unstarted")],
    [row("a", ALL)],
    [row("a", ALL), row("g", {}, "unstarted")],
    [row("a", { content: "approved" }), row("b", {})],
  ];
  for (const rows of cases) {
    const s = coverageSentence(rows);
    assert.match(s, /\.$/, `no full stop: ${s}`);
    assert.equal(s.includes("  "), false, `double space: ${s}`);
  }
});
