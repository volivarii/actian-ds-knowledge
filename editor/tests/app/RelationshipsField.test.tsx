// jsdom: Radix Select needs a real DOM.
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { RelationshipsField } from "../../src/form-engine/fields/RelationshipsField";

afterEach(() => cleanup());

const ENTITY = JSON.parse(
  readFileSync(
    new URL("../../../schemas/app-context-entity.json", import.meta.url).pathname,
    "utf8",
  ),
) as { properties: { relationships: unknown } };
const SCHEMA = ENTITY.properties.relationships;

function mount(formData: unknown) {
  const commits: unknown[] = [];
  render(
    <Theme>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <RelationshipsField
        {...({
          formData,
          schema: SCHEMA,
          onChange: (next: unknown) => commits.push(next),
          idSchema: { $id: "root_relationships" },
        } as any)}
      />
    </Theme>,
  );
  return { commits };
}

test("one row per relationship, both halves labelled", () => {
  mount({ contains: ["metadata", "lineage"], belongsTo: ["domain"] });
  for (const n of [1, 2, 3]) {
    assert.ok(
      screen.getByLabelText(new RegExp(`Relationship ${n} verb`, "i")),
      `verb ${n}`,
    );
    assert.ok(
      screen.getByLabelText(new RegExp(`Relationship ${n} target`, "i")),
      `target ${n}`,
    );
  }
});

test("a verb outside the vocabulary is kept and marked, not dropped", () => {
  // Refusing outright would leave an author unable to say a true thing;
  // silently dropping it would lose their data.
  mount({ hasFields: ["field"] });
  assert.ok(screen.getByText(/new verb/i));
  assert.ok(screen.getByLabelText(/Relationship 1 verb/i), "row still renders");
});

test("a target that is not a known entity is marked", () => {
  // The exact case F8 recorded: `hasFoo: nonexistent-entity` drew no error.
  mount({ contains: ["nonexistent-entity"] });
  assert.ok(screen.getByText(/not in the last published set/i));
});

test("a row with no target yet is not reported as an error", () => {
  // An incomplete row is not a wrong row. Marking it red the instant it
  // appears teaches an author they did something wrong by clicking Add.
  mount({ contains: ["metadata"] });
  fireEvent.click(screen.getByText(/Add relationship/i));
  assert.equal(
    screen.queryByText(/not in the last published set/i),
    null,
    "the new empty row must not be flagged",
  );
});

test("a known target and vocabulary verb are marked as neither", () => {
  mount({ contains: ["metadata"] });
  assert.equal(screen.queryByText(/new verb/i), null);
  assert.equal(screen.queryByText(/not in the last published set/i), null);
});

test("removing a row commits the map without it", () => {
  const { commits } = mount({ contains: ["metadata", "lineage"] });
  fireEvent.click(screen.getByLabelText(/Remove relationship 1/i));
  assert.deepEqual(commits.at(-1), { contains: ["lineage"] });
});

test("adding a row does not commit until it has a target", () => {
  // The row exists in the form; the saved value does not gain an empty verb.
  const { commits } = mount({ contains: ["metadata"] });
  fireEvent.click(screen.getByText(/Add relationship/i));
  assert.deepEqual(commits.at(-1), { contains: ["metadata"] });
  assert.ok(
    screen.getByLabelText(/Relationship 2 verb/i),
    "the new row is on screen even though it is not saved yet",
  );
});
