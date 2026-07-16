// The single source of the typed-relation visual language: one color and one
// human label per substrate node type, consumed by the graph map, the
// relations rail, and the inline reference chips so a type reads the same
// everywhere. Colors are Radix theme vars (never hardcoded hex) per the
// editor's token doctrine.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  relationTypeColor,
  relationTypeLabel,
} from "../../src/lib/relationTypes";
import { graphNodes } from "../../src/substrate/taxonomyAssets";

const KNOWN_TYPES = [
  "component",
  "category",
  "a11y_criterion",
  "foundation_section",
  "content_topic",
  "motion_pattern",
  "ux_pattern",
  "app",
  "app_entity",
  "terminology_term",
] as const;

test("every known node type maps to a Radix color var, not hardcoded hex", () => {
  for (const t of KNOWN_TYPES) {
    const c = relationTypeColor(t);
    assert.ok(c.startsWith("var(--"), `${t} should map to a Radix var, got ${c}`);
    assert.ok(!/#[0-9a-f]{3,6}/i.test(c), `${t} must not be a hardcoded hex`);
  }
});

test("known node types get distinct colors (the palette actually distinguishes)", () => {
  const colors = KNOWN_TYPES.map(relationTypeColor);
  assert.equal(
    new Set(colors).size,
    KNOWN_TYPES.length,
    "each known type should have its own color",
  );
});

test("an unrecognized type falls back to the neutral gray var", () => {
  const fallback = relationTypeColor("something-unknown");
  assert.equal(fallback, "var(--gray-8)");
});

test("relationTypeLabel gives human singular labels; unknown falls back to Node", () => {
  assert.equal(relationTypeLabel("component"), "Component");
  assert.equal(relationTypeLabel("ux_pattern"), "Pattern");
  assert.equal(relationTypeLabel("a11y_criterion"), "Accessibility criterion");
  assert.equal(relationTypeLabel("app_entity"), "Entity");
  assert.equal(relationTypeLabel("terminology_term"), "Term");
  assert.equal(relationTypeLabel("something-unknown"), "Node");
});

test("labels never leak internal snake_case keys", () => {
  for (const t of KNOWN_TYPES) {
    assert.ok(
      !relationTypeLabel(t).includes("_"),
      `${t} label should be human, got "${relationTypeLabel(t)}"`,
    );
  }
});

// Ground the palette in real data: every node type that actually appears in the
// substrate graph must have a real color + label, never the unknown fallback.
test("every node type present in the substrate graph is covered (no fallback)", () => {
  const present = [...new Set(graphNodes.map((n) => n.type))];
  assert.ok(present.length > 0, "graph should have nodes");
  const missing = present.filter(
    (t) =>
      relationTypeColor(t) === "var(--gray-8)" ||
      relationTypeLabel(t) === "Node",
  );
  assert.deepEqual(
    missing,
    [],
    `these graph node types have no typed color/label: ${missing.join(", ")}`,
  );
});
