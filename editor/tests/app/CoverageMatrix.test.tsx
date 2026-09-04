// The figure that replaced the statistics-then-chips-then-table stack.
//
// What has to hold: every component occupies exactly one cell in every row, so
// the denominator cannot drift; the words beside a row name real statuses
// rather than the three lit levels; and the CSV answers the question the
// figure cannot, which is WHICH component is unwritten.
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import {
  CoverageMatrix,
  cellsFor,
  coverageCsv,
  tally,
  tallyLabel,
} from "../../src/app/CoverageMatrix";
import { DOMAINS, DOMAIN_LABEL } from "../../src/lib/workspaceState";
import { STATE_FOR_STATUS } from "../../src/lib/nomenclature";
import { STATUSES, type CoverageRow, type Status } from "../../src/lib/coverageLoader";

afterEach(cleanup);

function row(slug: string, statuses: Partial<Record<string, Status>>): CoverageRow {
  return {
    slug,
    component: slug.toUpperCase(),
    domains: Object.fromEntries(
      DOMAINS.map((d) => [d, { status: statuses[d] ?? "not-started" }]),
    ) as CoverageRow["domains"],
    a11yRefs: [],
    origin: "authored",
  };
}

const ROWS: CoverageRow[] = [
  row("alpha", { content: "approved", usage: "approved", design: "inherited" }),
  row("beta", { content: "approved", usage: "draft", design: "inherited" }),
  row("gamma", { content: "draft" }),
];

test("every component occupies exactly one cell in every row", () => {
  // The denominator drifting is the defect this figure exists to avoid: a row
  // drawn over a different number of components than its neighbours is a
  // comparison nobody can make.
  for (const t of tally(ROWS)) {
    assert.equal(cellsFor(t).length, ROWS.length, `${t.domain} drew the wrong count`);
    const summed = STATUSES.reduce((n, s) => n + t.byStatus[s], 0);
    assert.equal(summed, ROWS.length, `${t.domain} tallied ${summed}`);
  }
});

test("every status has a key, so one falling to zero reads as zero", () => {
  const [content] = tally(ROWS);
  assert.ok(content);
  for (const s of STATUSES) {
    assert.equal(typeof content.byStatus[s], "number", `${s} has no key`);
  }
  assert.equal(content.byStatus.inherited, 0);
});

test("cells run lit, then half lit, then unlit", () => {
  // Sorting is what turns a row of cells into a length the eye can compare.
  const design = tally(ROWS).find((t) => t.domain === "design");
  assert.ok(design);
  assert.deepEqual(cellsFor(design), ["partial", "partial", "absent"]);
  const content = tally(ROWS).find((t) => t.domain === "content");
  assert.ok(content);
  assert.deepEqual(cellsFor(content), ["authored", "authored", "partial"]);
});

test("the words beside a row name real statuses and drop the zeros", () => {
  const content = tally(ROWS).find((t) => t.domain === "content");
  assert.ok(content);
  const label = tallyLabel(content);
  assert.equal(label, `2 ${STATE_FOR_STATUS.approved}, 1 ${STATE_FOR_STATUS.draft}`);
  assert.ok(
    !label.includes(STATE_FOR_STATUS.inherited),
    "a status at zero was named, which buries the ones that moved",
  );
});

test("the words come from the shared vocabulary, not from literals", () => {
  const tokens = tally(ROWS).find((t) => t.domain === "tokens");
  assert.ok(tokens);
  assert.ok(
    tallyLabel(tokens).includes(STATE_FOR_STATUS["not-started"]),
    "the figure invented its own word for not-started",
  );
});

test("each row carries its count in its accessible name", () => {
  const { container } = render(
    <Theme>
      <CoverageMatrix rows={ROWS} />
    </Theme>,
  );
  for (const d of DOMAINS) {
    const el = container.querySelector(`[data-domain="${d}"]`);
    assert.ok(el, `${d} row missing`);
    const label = el.getAttribute("aria-label") ?? "";
    assert.ok(
      label.startsWith(`${DOMAIN_LABEL[d]} across ${ROWS.length} components:`),
      `${d} label reads "${label}"`,
    );
    // The cells are decoration to a screen reader; the name carries it all.
    for (const cell of el.querySelectorAll("[data-fill]")) {
      assert.equal(cell.getAttribute("aria-hidden"), "true");
    }
  }
});

test("no rows renders nothing rather than five empty rows", () => {
  const { container } = render(
    <Theme>
      <CoverageMatrix rows={[]} />
    </Theme>,
  );
  assert.equal(container.querySelector('[data-testid="coverage-matrix"]'), null);
});

test("the CSV answers which component, which the figure cannot", () => {
  const csv = coverageCsv(ROWS);
  const lines = csv.trimEnd().split("\n");
  assert.equal(lines.length, ROWS.length + 1, "one header plus one line per component");
  assert.equal(
    lines[0],
    ["Component", "Slug", ...DOMAINS.map((d) => DOMAIN_LABEL[d])].join(","),
  );
  // Sorted by slug, so two exports of the same data are byte-identical.
  assert.ok(lines[1]?.startsWith("ALPHA,alpha,"));
  assert.ok(lines[3]?.startsWith("GAMMA,gamma,"));
  assert.ok(csv.endsWith("\n"), "the last row is a partial line");
});

test("the CSV speaks the same vocabulary as the screen", () => {
  const csv = coverageCsv(ROWS);
  assert.ok(csv.includes(STATE_FOR_STATUS.approved));
  assert.ok(csv.includes(STATE_FOR_STATUS["not-started"]));
});

test("a component name containing a comma or a quote does not break the CSV", () => {
  const csv = coverageCsv([
    { ...row("odd", { content: "approved" }), component: 'Tag, "read only"' },
  ]);
  const line = csv.trimEnd().split("\n")[1] ?? "";
  assert.ok(
    line.startsWith('"Tag, ""read only""",odd,'),
    `unescaped: ${line}`,
  );
  // Still one field per column after escaping.
  assert.equal(line.split('",')[1]?.split(",").length, DOMAINS.length + 1);
});
