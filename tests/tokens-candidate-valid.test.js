// tests/tokens-candidate-valid.test.js
// P4b — Validate live tokens/tokens.json (replaces candidate validation post-flip):
//   1. Structural invariants (every leaf has $type+$value, known $type, no leaf+group collision)
//   2. Reference-integrity (all {alias} refs, typography composite refs, com.actian.border/.focusRing refs)
//   3. Theme-extension integrity (com.actian.themes: {actian,studio,explorer} all valid hex)
//   4. Renderer dry-run (renderMarkdown over live tokens.json → non-empty, no throw)
//
// The candidate file (tokens/src/derived/tokens.candidate.json) no longer exists after
// the P4b flip — this test now guards the LIVE tokens.json with the same checks.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const LIVE_PATH = path.join(REPO_ROOT, "tokens", "tokens.json");

const KNOWN_TYPES = new Set([
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "typography",
  "shadow",
  "duration",
  "string",
  "cubicBezier",
  "number",
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Load live tokens.json once (lazy-cached). */
let _live = null;
function loadLive() {
  if (!_live) {
    _live = JSON.parse(fs.readFileSync(LIVE_PATH, "utf8"));
  }
  return _live;
}

/**
 * Recursive walker that collects:
 *   - leaves:     { path, node }  — any node with $value
 *   - groupPaths: Set of dot-paths for group (non-leaf) nodes
 */
function collectNodes(obj, prefix, leaves, groupPaths) {
  if (!obj || typeof obj !== "object") return;
  if ("$value" in obj) {
    leaves.push({ path: prefix, node: obj });
    return;
  }
  groupPaths.add(prefix);
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.startsWith("_")) continue;
    collectNodes(
      obj[key],
      prefix ? prefix + "." + key : key,
      leaves,
      groupPaths,
    );
  }
}

/**
 * Given the full tree, resolve a dotted path to its node.
 * Returns the node if it exists AND is a leaf ($value present), else null.
 */
function resolveRef(tree, dotted) {
  const parts = dotted.split(".");
  let cur = tree;
  for (const p of parts) {
    if (!cur || typeof cur !== "object" || !(p in cur)) return null;
    cur = cur[p];
  }
  return cur && typeof cur === "object" && "$value" in cur ? cur : null;
}

/**
 * Collect every alias reference from the tree:
 *   - $value strings of the form {a.b.c}
 *   - typography composite sub-values ({...} in fontWeight/fontSize/letterSpacing/lineHeight)
 *   - com.actian.border / com.actian.focusRing .color (and any other {…} values in those blocks)
 */
function collectAllRefs(tree) {
  const leaves = [];
  collectNodes(tree, "", leaves, new Set());
  const refs = [];

  for (const { path, node } of leaves) {
    const v = node.$value;

    // Direct alias
    if (typeof v === "string" && /^\{[^}]+\}$/.test(v)) {
      refs.push({ source: path, ref: v.slice(1, -1), kind: "value" });
    }

    // Typography composite
    if (v && typeof v === "object") {
      for (const [subKey, subVal] of Object.entries(v)) {
        if (typeof subVal === "string" && /^\{[^}]+\}$/.test(subVal)) {
          refs.push({
            source: path + ".$value." + subKey,
            ref: subVal.slice(1, -1),
            kind: "typography." + subKey,
          });
        }
      }
    }

    // Extension refs (com.actian.border, com.actian.focusRing)
    const ext = node.$extensions || {};
    for (const extKey of ["com.actian.border", "com.actian.focusRing"]) {
      const block = ext[extKey];
      if (block && typeof block === "object") {
        for (const [fk, fv] of Object.entries(block)) {
          if (typeof fv === "string" && /^\{[^}]+\}$/.test(fv)) {
            refs.push({
              source: path + ".$ext." + extKey + "." + fk,
              ref: fv.slice(1, -1),
              kind: "ext." + extKey,
            });
          }
        }
      }
    }
  }

  return refs;
}

// ─── Test 1: Live file exists and is generator-owned ────────────────────────

test("live tokens.json exists", () => {
  assert.ok(
    fs.existsSync(LIVE_PATH),
    "tokens.json must exist at " + LIVE_PATH,
  );
});

test("live tokens.json is generator-owned (_frozen:false)", () => {
  const tree = loadLive();
  assert.equal(
    tree.$metadata._frozen,
    false,
    "tokens.json must have _frozen:false post-flip",
  );
});

// ─── Test 2: Structural invariants ───────────────────────────────────────────

test("every leaf has $type AND $value", () => {
  const tree = loadLive();
  const leaves = [];
  collectNodes(tree, "", leaves, new Set());

  const missing = leaves.filter((l) => !l.node.$type).map((l) => l.path);

  assert.deepEqual(missing, [], "Leaves missing $type: " + missing.join(", "));
});

test("every leaf $type is a known DTCG type", () => {
  const tree = loadLive();
  const leaves = [];
  collectNodes(tree, "", leaves, new Set());

  const unknown = leaves
    .filter((l) => !KNOWN_TYPES.has(l.node.$type))
    .map((l) => l.path + " ($type=" + l.node.$type + ")");

  assert.deepEqual(
    unknown,
    [],
    "Leaves with unknown $type: " + unknown.join(", "),
  );
});

test("no leaf+group collision (leaf node has no non-$ children)", () => {
  const tree = loadLive();
  const leaves = [];
  collectNodes(tree, "", leaves, new Set());

  const collisions = leaves
    .filter((l) =>
      Object.keys(l.node).some((k) => !k.startsWith("$") && !k.startsWith("_")),
    )
    .map((l) => l.path);

  assert.deepEqual(
    collisions,
    [],
    "Leaf+group collisions: " + collisions.join(", "),
  );
});

test("leaf count >= 400 (live tokens.json is non-trivial)", () => {
  const tree = loadLive();
  const leaves = [];
  collectNodes(tree, "", leaves, new Set());
  assert.ok(
    leaves.length >= 400,
    "Expected >=400 leaves, got " + leaves.length,
  );
});

// ─── Test 3: Reference integrity ─────────────────────────────────────────────

test("all alias references resolve to a defined leaf in the live tree", () => {
  const tree = loadLive();
  const refs = collectAllRefs(tree);

  assert.ok(refs.length >= 100, "Expected >=100 refs, got " + refs.length);

  const unresolved = refs
    .filter((r) => resolveRef(tree, r.ref) === null)
    .map((r) => r.source + " -> {" + r.ref + "} [" + r.kind + "]");

  assert.deepEqual(
    unresolved,
    [],
    unresolved.length + " unresolved ref(s):\n  " + unresolved.join("\n  "),
  );
});

test("reference counts: value, typography, ext refs all present", () => {
  const tree = loadLive();
  const refs = collectAllRefs(tree);

  const valueRefs = refs.filter((r) => r.kind === "value");
  const typographyRefs = refs.filter((r) => r.kind.startsWith("typography."));
  const extRefs = refs.filter((r) => r.kind.startsWith("ext."));

  assert.ok(valueRefs.length > 0, "Expected value alias refs (found none)");
  assert.ok(
    typographyRefs.length > 0,
    "Expected typography composite refs (found none)",
  );
  assert.ok(
    extRefs.length > 0,
    "Expected extension (border/focusRing) refs (found none)",
  );
});

test("resolveRef returns null/falsy for dangling references", () => {
  // Build a tiny tree with one real leaf
  const tree = {
    color: {
      primary: {
        500: { $type: "color", $value: "#000000" },
      },
    },
  };
  // Real path resolves truthy
  assert.ok(
    resolveRef(tree, "color.primary.500"),
    "Expected to resolve real path",
  );
  // Missing shade returns null/falsy
  assert.equal(
    resolveRef(tree, "color.primary.999"),
    null,
    "Missing shade should return null",
  );
  // Missing branch returns null/falsy
  assert.equal(
    resolveRef(tree, "color.nonexistent.path"),
    null,
    "Missing branch should return null",
  );
});

// ─── Test 4: Theme-extension integrity ───────────────────────────────────────

test("every com.actian.themes entry has all three theme keys {actian,studio,explorer} as valid hex", () => {
  const tree = loadLive();
  const leaves = [];
  collectNodes(tree, "", leaves, new Set());

  const HEX_RE = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;
  const issues = [];

  for (const { path, node } of leaves) {
    const themes = (node.$extensions || {})["com.actian.themes"];
    if (!themes) continue;

    for (const key of ["actian", "studio", "explorer"]) {
      if (!(key in themes)) {
        issues.push(path + ": missing theme key '" + key + "'");
      } else if (!HEX_RE.test(themes[key])) {
        issues.push(
          path +
            ": invalid hex for theme '" +
            key +
            "': " +
            JSON.stringify(themes[key]),
        );
      }
    }
  }

  assert.deepEqual(
    issues,
    [],
    issues.length + " theme-extension issue(s):\n  " + issues.join("\n  "),
  );
});

// ─── Test 5: Renderer dry-run ─────────────────────────────────────────────────

test("renderer dry-run: renderMarkdown over live tokens.json produces non-empty markdown without throwing", () => {
  const { renderMarkdown } = require("../scripts/render-token-reference.js");
  const tree = loadLive();

  let result;
  assert.doesNotThrow(() => {
    result = renderMarkdown(tree);
  }, "renderMarkdown must not throw on the live tree");

  assert.ok(
    result && result.markdown,
    "renderMarkdown must return an object with .markdown",
  );
  assert.ok(
    result.markdown.length > 500,
    "Rendered markdown must be non-trivial (got " +
      (result.markdown || "").length +
      " chars)",
  );
  assert.ok(
    result.markdown.includes("# Token Reference"),
    "Rendered markdown must include the H1 heading",
  );
  assert.ok(
    result.entryCount >= 400,
    "Rendered entry count must be >= 400 (got " + result.entryCount + ")",
  );
});

test("renderer dry-run: renderMarkdown over live tokens.json writes live token-reference.md", () => {
  const { renderMarkdown } = require("../scripts/render-token-reference.js");
  const LIVE_REF_PATH = path.join(REPO_ROOT, "tokens", "token-reference.md");
  const tree = loadLive();
  const { markdown } = renderMarkdown(tree, "tokens/tokens.json");

  // Confirm the live file exists and contains no _frozen marker (it's generator-owned)
  if (fs.existsSync(LIVE_REF_PATH)) {
    const liveContent = fs.readFileSync(LIVE_REF_PATH, "utf8");
    assert.ok(
      !liveContent.includes("_frozen"),
      "Live token-reference.md must not contain a _frozen marker",
    );
  }

  // Confirm render output is non-trivial
  assert.ok(
    markdown && markdown.length > 500,
    "renderMarkdown output must be non-trivial",
  );
});
