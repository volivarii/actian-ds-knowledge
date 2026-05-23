import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYaml, stringifyYaml } from "../../src/form-engine/yamlSerializer";

test("yamlSerializer — round-trip preserves a simple _meta.yml shape", () => {
  const src = `component: Button
category: action
domains:
  content:
    status: approved
    owner: content-team
  usage:
    status: not-started
`;
  const obj = parseYaml(src);
  const re = parseYaml(stringifyYaml(obj));
  assert.deepEqual(re, obj);
});

test("yamlSerializer — round-trip preserves arrays", () => {
  const src = `related:
  - link
  - icon-button
examples:
  - label: Primary button
    figmaNode: "302:5142"
`;
  const obj = parseYaml(src);
  const re = parseYaml(stringifyYaml(obj));
  assert.deepEqual(re, obj);
});

test("yamlSerializer — stringify emits parseable YAML", () => {
  const input = {
    component: "Checkbox",
    domains: { content: { status: "approved" } },
  };
  const text = stringifyYaml(input);
  assert.deepEqual(parseYaml(text), input);
});

test("yamlSerializer — parseYaml of an empty string returns null (empty YAML document)", () => {
  assert.equal(parseYaml(""), null);
});
