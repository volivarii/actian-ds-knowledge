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
    usedBySlugs: ["explorer", "studio"],
  },
  {
    kind: "feature",
    slug: "lineage-graph",
    label: "Lineage graph",
    path: "app-context/src/patterns/lineage-graph.md",
    usedBy: ["Studio"],
    usedBySlugs: ["studio"],
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

// An entity and a feature cannot share a name: they are one namespace, and the
// dialog exists to stop exactly this kind of quiet forking.
test("NewContextRecordDialog: a name taken by the other kind is refused, not joined", () => {
  const r = renderDialog({ kind: "feature" });
  typeName(r, "Dataset");
  const note = r.getByTestId("cross-kind").textContent ?? "";
  assert.match(note, /entity is\s+already called/);
  assert.match(note, /Dataset/);
  assert.equal(r.queryByTestId("already-exists"), null);
  assert.equal(r.queryByRole("button", { name: "Use the existing one" }), null);
  fireEvent.click(r.getByRole("checkbox", { name: "Studio" }));
  assert.equal(
    (r.getByRole("button", { name: "New feature" }) as HTMLButtonElement)
      .disabled,
    true,
    "a cross-kind clash must not be submittable",
  );
});

test("NewContextRecordDialog: a record staged in this batch is reported honestly", () => {
  const r = renderDialog({
    records: [
      {
        kind: "entity",
        slug: "widget",
        label: "Widget",
        path: "app-context/src/entities/widget.md",
        usedBy: [],
        usedBySlugs: [],
        pending: true,
      },
    ],
  });
  typeName(r, "Widget");
  const note = r.getByTestId("already-exists").textContent ?? "";
  assert.match(note, /staged earlier in this batch/);
  assert.doesNotMatch(note, /not used by any product yet/);
  assert.doesNotMatch(note, /as of the last merge/);
});

test("NewContextRecordDialog: a merged record discloses that its product list may be stale", () => {
  const r = renderDialog();
  typeName(r, "Dataset");
  assert.match(
    r.getByTestId("already-exists").textContent ?? "",
    /as of the last merge/,
  );
});

// The badge steers which boxes get ticked, so it must match on the product's
// slug: labels are display strings and two products could share one.
test("NewContextRecordDialog: the already-listed badge matches on slug, not label", () => {
  const r = renderDialog({
    products: [
      { slug: "studio", label: "Studio" },
      { slug: "studio-next", label: "Studio" },
    ],
  });
  typeName(r, "Dataset");
  assert.equal(
    r.getAllByText("already listed").length,
    1,
    "only the product actually listed should be badged",
  );
});

test("NewContextRecordDialog: a name too long for the schema is refused", () => {
  const r = renderDialog();
  typeName(r, "a".repeat(61));
  assert.ok(r.getByText(/61 characters|60 characters or fewer/i));
  fireEvent.click(r.getByRole("checkbox", { name: "Studio" }));
  assert.equal(
    (r.getByRole("button", { name: "New entity" }) as HTMLButtonElement)
      .disabled,
    true,
  );
});
