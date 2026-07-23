import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import {
  NewProductDialog,
  type NewProductValue,
} from "../../src/app/NewProductDialog";
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
    kind: "entity",
    slug: "scanner",
    label: "Scanner",
    path: "app-context/src/entities/scanner.md",
    usedBy: [],
  },
  {
    kind: "feature",
    slug: "lineage-graph",
    label: "Lineage graph",
    path: "app-context/src/patterns/lineage-graph.md",
    usedBy: ["Studio"],
  },
];

function renderDialog(
  overrides: Partial<Parameters<typeof NewProductDialog>[0]> = {},
) {
  const defaults: Parameters<typeof NewProductDialog>[0] = {
    open: true,
    existingSlugs: ["studio", "explorer"],
    records: RECORDS,
    onConfirm: () => {},
    onCancel: () => {},
  };
  return render(
    <Theme>
      <NewProductDialog {...defaults} {...overrides} />
    </Theme>,
  );
}

function typeName(r: ReturnType<typeof renderDialog>, value: string) {
  fireEvent.change(r.getByLabelText("Product name"), { target: { value } });
}

test("NewProductDialog — the name derives the filename and the header variant", () => {
  const r = renderDialog();
  typeName(r, "Data Connect");
  assert.equal(
    (r.getByLabelText("Filename") as HTMLInputElement).value,
    "data-connect",
  );
  assert.equal(
    (r.getByLabelText("Header variant") as HTMLInputElement).value,
    "Data Connect",
  );
  assert.match(
    r.getByTestId("new-product-path").textContent ?? "",
    /app-context\/src\/apps\/data-connect\.md/,
  );
});

test("NewProductDialog — create stays disabled until the product has a name", () => {
  const r = renderDialog();
  const create = r.getByRole("button", { name: "Create product" });
  assert.equal((create as HTMLButtonElement).disabled, true);
  typeName(r, "Data Connect");
  assert.equal((create as HTMLButtonElement).disabled, false);
});

test("NewProductDialog — a filename that already exists is refused", () => {
  const r = renderDialog();
  typeName(r, "Studio");
  assert.ok(r.getByText(/product with that name already exists/i));
  assert.equal(
    (r.getByRole("button", { name: "Create product" }) as HTMLButtonElement)
      .disabled,
    true,
  );
});

test("NewProductDialog — each record shows the products that depend on it", () => {
  const r = renderDialog();
  assert.ok(r.getByText("used by Explorer, Studio"));
  assert.ok(r.getByText(/not used by any product yet/i));
});

test("NewProductDialog — claiming a shared record discloses the shared write", () => {
  const r = renderDialog();
  assert.equal(r.queryByTestId("shared-write-disclosure"), null);
  fireEvent.click(r.getByRole("checkbox", { name: /^Dataset/ }));
  const note = r.getByTestId("shared-write-disclosure");
  assert.match(note.textContent ?? "", /Explorer/);
  assert.match(note.textContent ?? "", /Studio/);
});

test("NewProductDialog — claiming an unused record raises no shared-write note", () => {
  const r = renderDialog();
  fireEvent.click(r.getByRole("checkbox", { name: /^Scanner/ }));
  assert.equal(r.queryByTestId("shared-write-disclosure"), null);
});

test("NewProductDialog — confirming returns the product and its claimed records", () => {
  let got: NewProductValue | null = null;
  const r = renderDialog({
    onConfirm: (v) => {
      got = v;
    },
  });
  typeName(r, "Data Connect");
  fireEvent.click(r.getByRole("checkbox", { name: /^Dataset/ }));
  fireEvent.click(r.getByRole("checkbox", { name: /^Lineage graph/ }));
  fireEvent.click(r.getByRole("button", { name: "Create product" }));

  assert.ok(got);
  const value: NewProductValue = got;
  assert.equal(value.label, "Data Connect");
  assert.equal(value.slug, "data-connect");
  assert.equal(value.headerType, "Data Connect");
  assert.deepEqual(value.claim.map((c) => c.path).sort(), [
    "app-context/src/entities/dataset.md",
    "app-context/src/patterns/lineage-graph.md",
  ]);
});

test("NewProductDialog — the filter narrows the record list", () => {
  const r = renderDialog();
  fireEvent.change(r.getByLabelText("Filter features and entities"), {
    target: { value: "lineage" },
  });
  assert.ok(r.queryByRole("checkbox", { name: /^Lineage graph/ }));
  assert.equal(r.queryByRole("checkbox", { name: /^Dataset/ }), null);
});
