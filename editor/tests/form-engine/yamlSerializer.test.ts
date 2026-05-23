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

test("yamlSerializer — stringifyYaml preserves the yaml-language-server header from originalText", () => {
  const src = `# yaml-language-server: $schema=../../../schemas/guideline-meta.json
component: Button
category: action
`;
  const obj = parseYaml(src);
  const out = stringifyYaml(obj, src);
  assert.ok(
    out.startsWith("# yaml-language-server:"),
    "expected yaml-language-server header at start of output",
  );
});

test("yamlSerializer — stringifyYaml preserves the header even when body changes", () => {
  const src = `# yaml-language-server: $schema=foo.json
component: Button
`;
  const out = stringifyYaml({ component: "Button", category: "action" }, src);
  assert.match(out, /^# yaml-language-server:/);
  assert.match(out, /category: action/);
});

test("yamlSerializer — stringifyYaml preserves multi-line + blank-line headers", () => {
  const src = `# yaml-language-server: $schema=foo.json
# Second comment line
# Third comment line

component: Button
`;
  const out = stringifyYaml({ component: "Checkbox" }, src);
  assert.match(out, /^# yaml-language-server:/);
  assert.match(out, /# Second comment line/);
  assert.match(out, /# Third comment line/);
  assert.match(out, /component: Checkbox/);
});

test("yamlSerializer — stringifyYaml without originalText emits no header", () => {
  const out = stringifyYaml({ component: "Button" });
  assert.equal(out.startsWith("#"), false);
});
