import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import {
  NewContextRecordDialog,
  type NewContextRecordValue,
} from "../../src/app/NewContextRecordDialog";
import type { ContextRecord } from "../../src/lib/contextRecords";

afterEach(cleanup);

const RECORDS: ContextRecord[] = [
  {
    kind: "entity",
    slug: "dataset",
    label: "Dataset",
    path: "app-context/src/entities/dataset.md",
    usedBy: ["Explorer", "Studio"],
  },
  {
    kind: "feature",
    slug: "lineage-graph",
    label: "Lineage graph",
    path: "app-context/src/patterns/lineage-graph.md",
    usedBy: ["Studio"],
  },
];

const PRODUCTS = [
  { slug: "studio", label: "Studio" },
  { slug: "data-connect", label: "Data Connect" },
];
const COMPONENTS = [
  { slug: "button", label: "Button" },
  { slug: "table", label: "Table" },
];

function renderDialog(
  overrides: Partial<Parameters<typeof NewContextRecordDialog>[0]> = {},
) {
  const defaults: Parameters<typeof NewContextRecordDialog>[0] = {
    open: true,
    kind: "entity",
    records: RECORDS,
    products: PRODUCTS,
    components: COMPONENTS,
    onConfirm: () => {},
    onCancel: () => {},
  };
  return render(
    <Theme>
      <NewContextRecordDialog {...defaults} {...overrides} />
    </Theme>,
  );
}

function typeName(r: ReturnType<typeof renderDialog>, value: string) {
  fireEvent.change(r.getByLabelText("Name"), { target: { value } });
}

test("NewContextRecordDialog: a record needs a name and at least one product", () => {
  const r = renderDialog();
  const create = () => r.getByRole("button", { name: "New entity" });
  assert.equal((create() as HTMLButtonElement).disabled, true);
  typeName(r, "Data Contract");
  assert.equal(
    (create() as HTMLButtonElement).disabled,
    true,
    "a name alone is not enough",
  );
  assert.ok(r.getByText(/Pick at least one product/i));
  fireEvent.click(r.getByRole("checkbox", { name: "Studio" }));
  assert.equal((create() as HTMLButtonElement).disabled, false);
});

test("NewContextRecordDialog: creating returns the record and its products", () => {
  let got: NewContextRecordValue | null = null;
  const r = renderDialog({ onConfirm: (v) => (got = v) });
  typeName(r, "Data Contract");
  fireEvent.click(r.getByRole("checkbox", { name: "Studio" }));
  fireEvent.click(r.getByRole("button", { name: "New entity" }));

  assert.ok(got);
  const v: NewContextRecordValue = got;
  assert.equal(v.mode, "create");
  assert.equal(v.kind, "entity");
  assert.equal(v.slug, "data-contract");
  assert.equal(v.label, "Data Contract");
  assert.deepEqual(v.apps, ["studio"]);
});

// The collision path is the feature, not an error branch.
test("NewContextRecordDialog: a taken name offers the existing record instead", () => {
  const r = renderDialog();
  typeName(r, "Dataset");
  const note = r.getByTestId("already-exists").textContent ?? "";
  assert.match(note, /Dataset/);
  assert.match(note, /Explorer, Studio/);
  assert.ok(r.getByRole("button", { name: "Use the existing one" }));
  assert.equal(r.queryByRole("button", { name: "New entity" }), null);
});

test("NewContextRecordDialog: joining returns the existing record, not a new one", () => {
  let got: NewContextRecordValue | null = null;
  const r = renderDialog({ onConfirm: (v) => (got = v) });
  typeName(r, "Dataset");
  fireEvent.click(r.getByRole("checkbox", { name: "Data Connect" }));
  fireEvent.click(r.getByRole("button", { name: "Use the existing one" }));

  assert.ok(got);
  const v: NewContextRecordValue = got;
  assert.equal(v.mode, "join");
  assert.deepEqual(v.apps, ["data-connect"]);
  assert.equal(v.existing?.path, "app-context/src/entities/dataset.md");
});

test("NewContextRecordDialog: a product already listed is marked as such", () => {
  const r = renderDialog();
  typeName(r, "Dataset");
  assert.ok(r.getByText("already listed"));
});

test("NewContextRecordDialog: only features offer the components picker", () => {
  const entity = renderDialog();
  assert.equal(entity.queryByLabelText("Filter components"), null);
  cleanup();

  const feature = renderDialog({ kind: "feature" });
  assert.ok(feature.getByLabelText("Filter components"));
  assert.ok(feature.getByRole("checkbox", { name: "Button" }));
});

test("NewContextRecordDialog: a feature carries its picked components", () => {
  let got: NewContextRecordValue | null = null;
  const r = renderDialog({ kind: "feature", onConfirm: (v) => (got = v) });
  typeName(r, "Import wizard");
  fireEvent.click(r.getByRole("checkbox", { name: "Studio" }));
  fireEvent.click(r.getByRole("checkbox", { name: "Table" }));
  fireEvent.click(r.getByRole("button", { name: "New feature" }));

  assert.ok(got);
  const v: NewContextRecordValue = got;
  assert.deepEqual(v.components, ["table"]);
  assert.equal(v.slug, "import-wizard");
});

test("NewContextRecordDialog: with no products it says so instead of offering nothing", () => {
  const r = renderDialog({ products: [] });
  assert.ok(r.getByText(/No products yet/i));
});
