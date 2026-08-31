"use strict";

// A link in component guidance must land on a page that exists.
//
// #588 and #605 are the same failure twice. A Figma sync can free a component
// slug and hand it to something else: `calendar` was the Calendar form
// component and became the calendar glyph on the Icons page, while the
// component moved to `calendar-data-selector`. Authored prose saying "pair it
// with an attached [calendar](calendar)" was then pointing at a slug with no
// guidance page at all, while every gate stayed green, because nothing checked
// that a link target is a page a reader can land on.
//
// 🔑 The namespace matters, and getting it wrong is how the first version of
// this test was wrong. A `](slug)` link addresses a PAGE, not a registry entry.
// Those key sets differ: 62 guideline pages against 324 registry entries, and
// 55 link targets in this corpus (`dropdown-select`, `global-toast`, …) have a
// guidance page and no dskit entry at all. Judging links against the registry
// checks a namespace the link does not address.
//
// A component page may legitimately link into either of two page namespaces:
// its sibling component guidance, and the content patterns
// (`[form](forms)` reaches `content/src/patterns/forms.md`). Both count.
//
// This asserts the JOIN rather than a hand-kept list of slugs: every target is
// resolved the way a consumer resolves it, THROUGH THE IDENTITY LEDGER, so a
// renamed component needs no edit here.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const { buildRenameIndex } = require("../clients/resolve-paths.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const GUIDELINES_DIR = path.join(REPO_ROOT, "components/dist/guidelines");
const LEDGER = path.join(REPO_ROOT, "components/dist/identity.json");
const CONTENT_DIRS = ["patterns", "writing", "product"];

// Derived aggregates that live beside the per-slug guideline JSONs and are not
// link targets.
const NOT_PAGES = new Set(["bundle", "coverage"]);

// `](slug)` — a relative markdown link to another page. An absolute URL, an
// anchor, or a path is somebody else's problem and is not matched.
const LINK = /\]\(([a-z0-9][a-z0-9-]*)\)/g;

function guidanceFiles() {
  return cp
    .execSync("git ls-files components/src", { cwd: REPO_ROOT })
    .toString()
    .split("\n")
    .filter((f) => f.endsWith(".md"));
}

/** Every slug a reader can actually land on, across both page namespaces. */
function pageSlugs() {
  // Null-prototype so a slug colliding with a name on Object.prototype cannot
  // resolve through it. `pages["constructor"]` on a plain object is truthy and
  // would exempt the link silently. clients/resolve-paths.js:70 guards the same
  // way for the same reason.
  const pages = Object.create(null);
  fs.readdirSync(GUIDELINES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((s) => !NOT_PAGES.has(s))
    .forEach((s) => {
      pages[s] = "guideline";
    });
  for (const dir of CONTENT_DIRS) {
    let entries;
    try {
      entries = fs.readdirSync(path.join(REPO_ROOT, "content/src", dir));
    } catch (e) {
      continue;
    }
    entries
      .filter((f) => f.endsWith(".md"))
      .forEach((f) => {
        const s = f.replace(/\.md$/, "");
        if (!pages[s]) pages[s] = "content";
      });
  }
  return pages;
}

/**
 * Resolve a link target the way a consumer does. `clients/resolve-paths.js`
 * applies the rename map FIRST (`renameMap[slug] || slug`), so this does too:
 * matching that order is the point of asserting the join rather than
 * reimplementing it.
 */
function resolveTarget(slug, renames) {
  return renames[slug] || slug;
}

/**
 * Links in component guidance whose target is not a page, with their line.
 *
 * `extraDocs` injects synthetic documents for the positive control. The control
 * must NOT write a probe into the real corpus: `node --test` runs test FILES
 * concurrently and several siblings read `components/src`, so a temporarily
 * modified guidance file is a flake waiting to happen in whichever test reads
 * it mid-probe.
 */
function deadLinks(extraDocs) {
  const pages = pageSlugs();
  const renames = buildRenameIndex(
    JSON.parse(fs.readFileSync(LEDGER, "utf8")),
  );
  const hits = [];
  const docs = guidanceFiles().map((file) => ({ file: file, text: null }));
  for (const doc of docs.concat(extraDocs || [])) {
    const file = doc.file;
    let text = doc.text;
    if (text === null) {
      try {
        text = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
      } catch (e) {
        continue;
      }
    }
    text.split("\n").forEach((line, i) => {
      LINK.lastIndex = 0;
      let m;
      while ((m = LINK.exec(line)) !== null) {
        if (!pages[resolveTarget(m[1], renames)]) {
          hits.push(`${file}:${i + 1} -> ${m[1]}`);
        }
      }
    });
  }
  return hits;
}

test("the scanner has a corpus to scan", () => {
  // `git ls-files` on a path that does not exist exits 0 with EMPTY output, so
  // relocating components/src would disarm the assertion below rather than
  // break it, and the gate would pass while checking nothing.
  const files = guidanceFiles();
  assert.ok(
    files.length > 50,
    `expected the component guidance corpus, found ${files.length} files`,
  );
});

test("every link in component guidance lands on a page that exists", () => {
  assert.deepEqual(
    deadLinks(),
    [],
    "a link whose target is neither a guideline page nor a content page sends " +
      "the reader nowhere, and resolves cleanly while doing it",
  );
});

test("the gate can fail: a link to a slug with no page is caught", () => {
  // Routed through deadLinks() itself, not its helpers: a positive control that
  // reimplements the scan proves nothing about the scan. The probe is injected
  // rather than written to disk, so it cannot race a sibling test file.
  const hits = deadLinks([
    { file: "probe.md", text: "see [nothing](no-such-page-anywhere)." },
  ]);
  assert.ok(
    hits.includes("probe.md:1 -> no-such-page-anywhere"),
    `the scanner missed a link with no page; saw ${JSON.stringify(hits)}`,
  );
});

test("the gate does not fire on a link that does reach a page", () => {
  // The inverse, so the control above cannot pass by flagging everything.
  const pages = pageSlugs();
  const real = Object.keys(pages)[0];
  assert.ok(real);
  assert.deepEqual(
    deadLinks([{ file: "probe.md", text: `see [it](${real}).` }]).filter((h) =>
      h.startsWith("probe.md"),
    ),
    [],
  );
});

test("a retired slug is resolved through the ledger before being judged", () => {
  // The join, asserted. A renamed component's old slug must be judged on the
  // page it REACHES, which is what keeps this gate free of a slug list.
  const pages = pageSlugs();
  const renames = buildRenameIndex(
    JSON.parse(fs.readFileSync(LEDGER, "utf8")),
  );
  const retired = Object.keys(renames).find((s) => pages[renames[s]]);
  assert.ok(retired, "the ledger must carry at least one rename reaching a page");
  assert.equal(resolveTarget(retired, renames), renames[retired]);
  assert.ok(
    !pages[retired],
    `${retired} should have no page of its own, which is why the ledger matters`,
  );
});

test("a slug colliding with an Object.prototype name does not resolve", () => {
  // `pages["constructor"]` on a plain object is truthy, which would exempt
  // `](constructor)` from the check without anyone noticing.
  const pages = pageSlugs();
  assert.equal(pages["constructor"], undefined);
  assert.equal(pages["toString"], undefined);
});
