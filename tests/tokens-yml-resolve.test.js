"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
// Reuse the shared frontmatter parser — the exact one derive-guidelines.js
// uses for tokens.yml (parseFrontmatter(text, 0)).
const yamlParser = require("../scripts/lib/frontmatter");

// Every binding token in any components/src/<slug>/tokens.yml MUST resolve to a
// real token in tokens/tokens.json. Schema validation can't check cross-file
// existence; this closes that gap and catches Figma-var alias mistakes at CI.
const SRC = path.join(__dirname, "..", "components", "src");
const TOKENS = path.join(__dirname, "..", "tokens", "tokens.json");

function tokenNameSet() {
  const t = JSON.parse(fs.readFileSync(TOKENS, "utf8"));
  const out = new Set();
  (function walk(o, p) {
    for (const k in o) {
      if (k.startsWith("$") || k.startsWith("_")) continue;
      const v = o[k];
      if (v && typeof v === "object") {
        if ("$value" in v || "value" in v) out.add(p.concat(k).join("-"));
        else walk(v, p.concat(k));
      }
    }
  })(t, []);
  return out;
}

function tokensYmlFiles() {
  if (!fs.existsSync(SRC)) return [];
  return fs
    .readdirSync(SRC, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(SRC, d.name, "tokens.yml"))
    .filter((f) => fs.existsSync(f));
}

test("every tokens.yml binding resolves to a real token in tokens.json", () => {
  const known = tokenNameSet();
  const problems = [];
  for (const file of tokensYmlFiles()) {
    const doc =
      yamlParser.parseFrontmatter(fs.readFileSync(file, "utf8"), 0) || {};
    // Fail loudly on a parse failure / empty bindings rather than passing a
    // file that contributes zero checks (e.g. a `binding:` typo or malformed
    // block). The schema also requires minItems:1, but this gate must not
    // silently green a tokens.yml that yielded nothing.
    if (!Array.isArray(doc.bindings) || doc.bindings.length === 0) {
      problems.push(
        `${path.relative(SRC, file)} → no non-empty bindings array (parse failure or empty file)`,
      );
      continue;
    }
    for (const b of doc.bindings) {
      if (!known.has(b.token)) {
        problems.push(
          `${path.relative(SRC, file)} → unknown token "${b.token}"`,
        );
      }
    }
  }
  assert.deepEqual(
    problems,
    [],
    "Unresolved token bindings:\n" + problems.join("\n"),
  );
});
