// The status readout replaced eight rows of five badges on the front door.
// What has to hold: the shape is coarse, the accessible name is exact, and
// neither channel invents a vocabulary of its own.
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import {
  CoverageCells,
  coverageCellsLabel,
  FILL_FOR_STATUS,
  type DomainStatuses,
} from "../../src/app/CoverageCells";
import { DOMAINS, DOMAIN_LABEL } from "../../src/lib/workspaceState";
import { STATE_FOR_STATUS } from "../../src/lib/nomenclature";
import { STATUSES, type Status } from "../../src/lib/coverageLoader";

afterEach(cleanup);

const MIXED: DomainStatuses = {
  content: "approved",
  usage: "draft",
  design: "inherited",
  behavior: "not-started",
  tokens: "approved",
};

function fills(container: HTMLElement): string[] {
  return [...container.querySelectorAll("[data-fill]")].map(
    (el) => el.getAttribute("data-fill") ?? "",
  );
}

test("every substrate status maps to a lit level, so no status renders blank", () => {
  for (const s of STATUSES) {
    assert.ok(
      FILL_FOR_STATUS[s],
      `status ${s} has no cell fill, so its cell would render unstyled`,
    );
  }
});

test("draft and inherited share a lit level but never share a name", () => {
  // The whole point of two channels: the shape collapses these, the words
  // must not. A change that made the label coarse too would pass a test that
  // only checked the fills.
  assert.equal(FILL_FOR_STATUS.draft, FILL_FOR_STATUS.inherited);
  assert.notEqual(
    STATE_FOR_STATUS.draft,
    STATE_FOR_STATUS.inherited,
    "the readout's exact channel cannot tell a draft from a category default",
  );
});

test("the accessible name spells out every domain's real status", () => {
  const label = coverageCellsLabel(MIXED, "Action bar");
  assert.ok(label.startsWith("Action bar: "), label);
  for (const d of DOMAINS) {
    const expected = `${DOMAIN_LABEL[d]} ${STATE_FOR_STATUS[MIXED[d]]}`;
    assert.ok(
      label.includes(expected),
      `label is missing "${expected}"\nlabel: ${label}`,
    );
  }
});

test("the name is built from the shared vocabulary, not from literals", () => {
  // If someone hardcodes "Not started" here while nomenclature says "Empty",
  // the table beside this readout and the readout disagree. Assert the join.
  const label = coverageCellsLabel(MIXED);
  assert.ok(
    label.includes(STATE_FOR_STATUS["not-started"]),
    `label does not use STATE_FOR_STATUS["not-started"] (${STATE_FOR_STATUS["not-started"]}): ${label}`,
  );
  assert.ok(!label.includes("Action bar"), "no subject was given");
});

test("the readout renders one cell per domain, in canonical order", () => {
  const { container } = render(
    <Theme>
      <CoverageCells statuses={MIXED} subject="Action bar" />
    </Theme>,
  );
  const cells = [...container.querySelectorAll("[data-domain]")];
  assert.deepEqual(
    cells.map((el) => el.getAttribute("data-domain")),
    [...DOMAINS],
  );
  assert.deepEqual(fills(container), [
    "authored",
    "partial",
    "partial",
    "absent",
    "authored",
  ]);
});

test("the cells are hidden from assistive tech and the strip carries the name", () => {
  const { container } = render(
    <Theme>
      <CoverageCells statuses={MIXED} subject="Action bar" />
    </Theme>,
  );
  const strip = container.querySelector('[data-testid="coverage-cells"]');
  assert.ok(strip, "no readout rendered");
  assert.equal(strip?.getAttribute("role"), "img");
  assert.equal(
    strip?.getAttribute("aria-label"),
    coverageCellsLabel(MIXED, "Action bar"),
  );
  // Five cells announced individually would read as five nameless images.
  for (const cell of container.querySelectorAll("[data-domain]")) {
    assert.equal(cell.getAttribute("aria-hidden"), "true");
  }
});

test("the readout is not focusable, because a 9px cell is below the target floor", () => {
  const { container } = render(
    <Theme>
      <CoverageCells statuses={MIXED} />
    </Theme>,
  );
  assert.equal(
    container.querySelectorAll("button, a, [tabindex]").length,
    0,
    "the readout gained an interactive cell; the row's own control is the target",
  );
});

test("an all-absent row still renders five cells rather than nothing", () => {
  const blank = Object.fromEntries(
    DOMAINS.map((d) => [d, "not-started" as Status]),
  ) as DomainStatuses;
  const { container } = render(
    <Theme>
      <CoverageCells statuses={blank} subject="Avatar" />
    </Theme>,
  );
  assert.equal(fills(container).length, DOMAINS.length);
  assert.ok(fills(container).every((f) => f === "absent"));
});
