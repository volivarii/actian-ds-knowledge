import test from "node:test";
import assert from "node:assert/strict";
import { parseYaml, stringifyYaml } from "../../src/form-engine/yamlSerializer";

test("a11y_refs round-trips as flow-style items", () => {
  const value = {
    component: "Buttons",
    category: "action",
    a11y_refs: [{ ref: "buttons" }, { ref: "modals", note: "focus returns" }],
    domains: { content: { status: "inherited" } },
  };
  const yaml = stringifyYaml(value, { originalText: "", flowAtDepth: 2 });
  assert.match(yaml, /a11y_refs:\n\s+- \{ ref: buttons \}/);
  assert.match(yaml, /- \{ ref: modals, note: focus returns \}/);
  assert.deepEqual(
    (parseYaml(yaml) as typeof value).a11y_refs,
    value.a11y_refs,
  );
});
