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
// Scope, stated rather than assumed. This gate judges links whose target is a
// COMPONENT GUIDANCE page, because that is the resolution it can prove: one
// authored slug, one published page.
//
// It deliberately does NOT judge a target that names a content file.
// `content-derive` CONCATENATES `content/src/{patterns,writing,product}/*.md`
// into four dist pages, so `forms` is a `## Forms` heading inside
// `content/dist/patterns.md`, not a page, and the docs site has no
// `/content/forms` route. Whether such a link should become an anchor is a
// content-routing decision, not this gate's to guess: asserting an unverified
// resolution model is what produced this gate's two earlier misses. Those
// targets are skipped and the question is filed.
//
// 🔑🔑 The ledger is NOT part of resolving a link, and the first version of this
// gate got that wrong too. `clients/resolve-paths.js` redirects a retired slug
// for a consumer that CALLS it. The docs site does not: it generates one page
// per authored slug and resolves a relative markdown link by PATH, so
// `[drawer](drawer-side-panel)` 404s however complete the ledger is. Accepting
// the ledger here passed 21 links that broke the published site on the
// 2026-08-31 vendor refresh, taking its deploy red. A link must name a page
// that EXISTS.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const { buildRenameIndex } = require("../clients/resolve-paths.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const GUIDELINES_DIR = path.join(REPO_ROOT, "components/dist/guidelines");
const LEDGER = path.join(REPO_ROOT, "components/dist/identity.json");
// Basenames under these dirs are NOT pages (see the header): they are sections
// concatenated into content/dist. Recorded so a link naming one can be skipped
// rather than silently judged against the wrong namespace.
const CONTENT_SECTION_DIRS = ["patterns", "writing", "product"];

// Derived aggregates that live beside the per-slug guideline JSONs and are not
// link targets. Matched on FILENAME: the previous set held "bundle", but
// "guidelines.bundle.json" strips to "guidelines.bundle", so nothing ever
// matched and the aggregate was registered as a landable page.
const NOT_PAGE_FILES = new Set(["guidelines.bundle.json", "bundle.json"]);

// `](slug)`, plus the relative shapes that reach the same page and 404 the same
// way: a leading `./`, a trailing `#anchor`, a trailing `.md`. An absolute URL
// and a bare in-page `#anchor` are not matched. Previously only the bare form
// was, so `](drawer-side-panel#body)` passed a green gate.
const LINK = /\]\(\.?\/?([a-z0-9][a-z0-9-]*)(?:\.md)?(?:#[^)]*)?\)/g;

function guidanceFiles() {
  // content/src is in the corpus because its prose is concatenated INTO the
  // component guideline pages: a single `](date-input)` authored in
  // content/src/patterns/validation-messages.md reached five published
  // component pages, and a corpus of components/src alone could not see it.
  return cp
    .execSync("git ls-files components/src content/src", { cwd: REPO_ROOT })
    .toString()
    .split("\n")
    .filter((f) => f.endsWith(".md"))
    // Meta-docs are about authoring, not authored guidance, and they quote link
    // SYNTAX (`[link](filename-without-extension)`) rather than linking. The
    // repo already draws this line: EditorShell.tsx:56 excludes the same two.
    .filter((f) => !/(^|\/)(AUTHORING|EDITING-GUIDE)\.md$/.test(f));
}

/** Every slug a reader can actually land on, across both page namespaces. */
/** Slugs that name a content SECTION rather than a page. Not judged here. */
function contentSectionSlugs() {
  const out = Object.create(null);
  for (const dir of CONTENT_SECTION_DIRS) {
    let entries;
    try {
      entries = fs.readdirSync(path.join(REPO_ROOT, "content/src", dir));
    } catch (e) {
      continue;
    }
    entries
      .filter((f) => f.endsWith(".md"))
      .forEach((f) => {
        out[f.replace(/\.md$/, "")] = true;
      });
  }
  return out;
}

function pageSlugs() {
  // Null-prototype so a slug colliding with a name on Object.prototype cannot
  // resolve through it. `pages["constructor"]` on a plain object is truthy and
  // would exempt the link silently. clients/resolve-paths.js:70 guards the same
  // way for the same reason.
  const pages = Object.create(null);
  fs.readdirSync(GUIDELINES_DIR)
    .filter((f) => f.endsWith(".json") && !NOT_PAGE_FILES.has(f))
    .map((f) => f.replace(/\.json$/, ""))
    .forEach((s) => {
      pages[s] = "guideline";
    });
  // A page this PR ADDS has no derived JSON on its first head, because
  // validate-manifest tests the committed dist and guidelines-derive has not
  // pushed yet. Accepting the authored directory keeps a new component from
  // reporting as a dead link until the bot catches up, which would read as a
  // real failure to an outside author (#498).
  try {
    fs.readdirSync(path.join(REPO_ROOT, "components/src"), {
      withFileTypes: true,
    })
      .filter((d) => d.isDirectory())
      .filter((d) =>
        fs.existsSync(
          path.join(REPO_ROOT, "components/src", d.name, "_meta.yml"),
        ),
      )
      .forEach((d) => {
        if (!pages[d.name]) pages[d.name] = "authored";
      });
  } catch (e) {
    /* no authored tree — the derived set stands alone */
  }
  return pages;
}

/**
 * A retired slug that the ledger redirects is still a BROKEN LINK, because the
 * site routes by path. Kept as a named helper so the reason is legible where
 * somebody would otherwise reintroduce the redirect.
 */
function isRetiredButRedirected(slug, renames, pages) {
  return Boolean(renames[slug]) && Boolean(pages[renames[slug]]);
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
  const sections = contentSectionSlugs();
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
        const slug = m[1];
        // Out of scope by decision, not by omission: see the header.
        if (sections[slug]) continue;
        if (!pages[slug]) {
          hits.push(
            `${file}:${i + 1} -> ${slug}` +
              (isRetiredButRedirected(slug, renames, pages)
                ? ` (retired, now ${renames[slug]})`
                : ""),
          );
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
  // Sorted, and asserted to be a slug the matcher actually matches: an
  // unsorted readdir could hand back a name the regex skips, and the control
  // would then pass against a string the scanner never scanned.
  const real = Object.keys(pages).sort()[0];
  assert.ok(real && /^[a-z0-9][a-z0-9-]*$/.test(real), `unusable probe: ${real}`);
  assert.deepEqual(
    deadLinks([{ file: "probe.md", text: `see [it](${real}).` }]).filter((h) =>
      h.startsWith("probe.md"),
    ),
    [],
  );
});

test("a retired slug is a broken link even though the ledger redirects it", () => {
  // The correction that matters. The ledger redirects a retired slug for a
  // consumer that calls resolve-paths; the docs site routes by path and 404s.
  // Treating the redirect as resolution is what let 21 links break the
  // published site while this gate was green.
  const pages = pageSlugs();
  const renames = buildRenameIndex(
    JSON.parse(fs.readFileSync(LEDGER, "utf8")),
  );
  const retired = Object.keys(renames).find(
    (s) => pages[renames[s]] && !pages[s],
  );
  assert.ok(retired, "the ledger must carry a rename whose old slug has no page");
  assert.ok(
    isRetiredButRedirected(retired, renames, pages),
    "the ledger does redirect it",
  );
  const hits = deadLinks([
    { file: "probe.md", text: `see [it](${retired}).` },
  ]).filter((h) => h.startsWith("probe.md"));
  assert.equal(hits.length, 1, "and it is STILL reported as a dead link");
  assert.match(hits[0], /retired, now /, "named as a rename, so the fix is obvious");
});

test("a slug colliding with an Object.prototype name does not resolve", () => {
  // `pages["constructor"]` on a plain object is truthy, which would exempt
  // `](constructor)` from the check without anyone noticing.
  const pages = pageSlugs();
  assert.equal(pages["constructor"], undefined);
  assert.equal(pages["toString"], undefined);
});
