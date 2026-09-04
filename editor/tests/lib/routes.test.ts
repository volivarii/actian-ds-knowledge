import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hashFor,
  pathFromHash,
  stateFromHash,
  titleFor,
  SCREEN_TITLE,
} from "../../src/lib/routes";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";
import { isPlainMarkdown } from "../../src/app/EditorShell";

/** Every pair the segment table is meant to carry: activePath <-> hash. */
const PAIRS: ReadonlyArray<readonly [string | null, string]> = [
  // Screens that are not a file.
  [null, "#/"],
  ["inbox", "#/drafts"],

  // A component: its workspace, its five domains, its metadata.
  ["workspace/button", "#/component/button"],
  ["components/src/button/content.md", "#/component/button/content"],
  ["components/src/button/usage.md", "#/component/button/usage"],
  ["components/src/button/design.md", "#/component/button/design"],
  ["components/src/button/behavior.md", "#/component/button/behavior"],
  ["components/src/button/_meta.yml", "#/component/button/meta"],

  // Categories sit inside components/src but are not a component.
  ["components/src/categories/form.md", "#/category/form"],

  // Design system domains.
  ["foundations/src/tokens.md", "#/foundations/tokens"],
  ["accessibility/src/color-contrast.md", "#/accessibility/color-contrast"],

  // Content, named as the sidebar names it.
  ["content/src/writing/capitalization.md", "#/writing/capitalization"],
  ["content/src/patterns/forms.md", "#/pattern/forms"],
  [
    "content/src/product/related-content-panels.md",
    "#/product/related-content-panels",
  ],
  ["content/src/global-guidelines.md", "#/content/global-guidelines"],

  // `content/src/patterns` keeps `#/pattern/` because it is a published
  // address; app-context's Patterns take `#/ux-pattern/` rather than move it.
    ["app-context/src/apps/studio.md", "#/app/studio"],
  ["app-context/src/entities/data-product.md", "#/entity/data-product"],
  ["app-context/src/patterns/import-wizard.md", "#/ux-pattern/import-wizard"],
];

for (const [path, hash] of PAIRS) {
  test(`hashFor: ${path ?? "home"} -> ${hash}`, () => {
    assert.equal(hashFor(path), hash);
  });
  test(`pathFromHash: ${hash} -> ${path ?? "home"}`, () => {
    assert.equal(pathFromHash(hash), path);
  });
}

test("hashFor: a file the editor cannot open gets no named address", () => {
  // tokens.yml is YAML-backed and not editor-openable, so naming it promised a
  // link that renders the refusal banner for whoever received it.
  assert.equal(
    hashFor("components/src/button/tokens.yml"),
    "#/file/components/src/button/tokens.yml",
  );
  // And it is not readable in the other direction either. Resolving it would
  // land the reader on the refusal banner and then rewrite their address; home
  // is the honest answer until tokens.yml becomes openable.
  assert.equal(pathFromHash("#/component/button/tokens"), null);
});

test("hashFor: a path no segment claims falls back to the raw path", () => {
  assert.equal(
    hashFor("app-context/src/recipes/catalog-browse.md"),
    "#/file/app-context/src/recipes/catalog-browse.md",
  );
});

test("pathFromHash: the fallback hash resolves back to the raw path", () => {
  assert.equal(
    pathFromHash("#/file/app-context/src/recipes/catalog-browse.md"),
    "app-context/src/recipes/catalog-browse.md",
  );
});

test("pathFromHash: an unreadable hash lands on home, not on a blank pane", () => {
  assert.equal(pathFromHash("#/nonsense/xyz"), null);
  assert.equal(pathFromHash(""), null);
  assert.equal(pathFromHash("#"), null);
});

// ---------------------------------------------------------------------------
// The corpus gates. These walk the real repository rather than a list written
// here, so a domain that gains a directory shows up as a failure instead of as
// a link that quietly opens the wrong thing.
// ---------------------------------------------------------------------------

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const SRC_DIRS = [
  "components/src",
  "foundations/src",
  "content/src",
  "accessibility/src",
  "app-context/src",
];

let corpusCache: string[] | null = null;
function corpus(): string[] {
  if (corpusCache) return corpusCache;
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(join(REPO, rel), { withFileTypes: true })) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(child);
      else if (/\.(md|yml)$/.test(e.name)) out.push(child);
    }
  };
  for (const d of SRC_DIRS) walk(d);
  corpusCache = out;
  return out;
}

test("corpus: the walk finds the corpus at all", () => {
  // Without this, narrowing SRC_DIRS or the extension filter would leave the
  // three gates below filtering an empty list and passing while checking
  // nothing. 301 files on 2026-09-01; the floor is loose enough to survive
  // ordinary pruning and tight enough to catch a walk that found nothing.
  assert.ok(
    corpus().length > 200,
    `corpus walk found ${corpus().length} files, expected the whole src tree`,
  );
});

test("corpus: every authorable file round-trips through its hash", () => {
  const broken = corpus().filter((p) => pathFromHash(hashFor(p)) !== p);
  assert.deepEqual(broken, [], "these paths do not survive the round trip");
});

test("corpus: no two files share a hash", () => {
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const p of corpus()) {
    const h = hashFor(p);
    const first = seen.get(h);
    if (first) collisions.push(`${h} <- ${first} AND ${p}`);
    else seen.set(h, p);
  }
  assert.deepEqual(collisions, [], "two paths resolve to one address");
});

test("corpus: everything the editor can open has a readable address", () => {
  // The oracle is the editor's own dispatch, not a list kept here: if
  // EditorShell will render an edit screen for a path, that path must get a
  // named address rather than the raw-path fallback.
  const openable = (p: string) =>
    matchFrontmatterForm(p) != null ||
    isPlainMarkdown(p) ||
    /^components\/src\/[^/]+\/_meta\.yml$/.test(p);
  const unnamed = corpus().filter(
    (p) => openable(p) && hashFor(p).startsWith("#/file/"),
  );
  assert.deepEqual(unnamed, [], "these open in the editor but have no address");
});

test("corpus: the gate can fail (positive control)", () => {
  // Proof the three gates above are not tautological: a path shape the table
  // does not claim takes the fallback, and one it does claim does not.
  // `notEqual` against the bare "#/file/" prefix would pass for every input,
  // mapped or not, so the discriminating form is startsWith.
  assert.ok(hashFor("some/unmapped/place/thing.md").startsWith("#/file/"));
  assert.ok(
    !hashFor("components/src/button/content.md").startsWith("#/file/"),
  );
});

// ---------------------------------------------------------------------------
// The overview screens, the addresses they replaced, and the document title.
// ---------------------------------------------------------------------------

test("hashFor: home is home, with nothing qualifying it", () => {
  assert.equal(hashFor(null), "#/");
  assert.equal(hashFor(""), "#/");
});

test("every overview screen has an address that round-trips", () => {
  for (const screen of ["coverage", "accessibility", "patterns", "health"]) {
    const hash = hashFor(screen);
    assert.equal(hash, `#/${screen}`, `${screen} minted ${hash}`);
    assert.equal(
      pathFromHash(hash),
      screen,
      `${screen} did not survive the round trip`,
    );
  }
});

test("the addresses the tabs used to mint still land on what replaced them", () => {
  // These are in people's history and in chat threads. Resolving them to home
  // would land a reader on a screen that no longer holds what they were sent.
  assert.equal(pathFromHash("#/explore/coverage"), "coverage");
  assert.equal(pathFromHash("#/explore/accessibility"), "accessibility");
  assert.equal(pathFromHash("#/explore/patterns"), "patterns");
  // Relationships was renamed: it is a diagnostic over the whole substrate,
  // not a scope, so the old address has to be told where its content went.
  assert.equal(pathFromHash("#/explore/relationships"), "health");
});

test("a legacy address is read, never minted", () => {
  // If hashFor ever returned one, the write effect would rewrite a reader's
  // canonical address back to the retired form on every navigation.
  for (const screen of ["coverage", "accessibility", "patterns", "health"]) {
    assert.ok(
      !hashFor(screen).startsWith("#/explore/"),
      `${screen} minted a retired address`,
    );
  }
});

test("an explore address naming nothing real is not a screen", () => {
  assert.equal(pathFromHash("#/explore/nonsense"), null);
  assert.equal(pathFromHash("#/explore"), null);
  assert.equal(pathFromHash("#/explore/patterns/extra"), null);
});

test("titleFor: a component reads as its name, not its slug", () => {
  assert.equal(
    titleFor("components/src/data-product/content.md"),
    "Data Product content · Actian DS Knowledge Editor",
  );
  assert.equal(
    titleFor("workspace/data-product"),
    "Data Product · Actian DS Knowledge Editor",
  );
});

test("titleFor: the home screen is the product name alone", () => {
  assert.equal(titleFor(null), "Actian DS Knowledge Editor");
});

test("titleFor: a record reads as its own name", () => {
  assert.equal(
    titleFor("app-context/src/entities/data-product.md"),
    "Data Product · Actian DS Knowledge Editor",
  );
  assert.equal(titleFor("inbox"), "Drafts · Actian DS Knowledge Editor");
});

test("pathFromHash: a fallback address with no path is home, not an empty file", () => {
  assert.equal(pathFromHash("#/file/"), null);
  assert.equal(pathFromHash("#/file"), null);
});

// ---------------------------------------------------------------------------
// stateFromHash: the whole screen an address names, read in one go, so App can
// seed its state synchronously rather than correcting it after first paint.
// ---------------------------------------------------------------------------

test("stateFromHash: a home address is the home screen", () => {
  assert.deepEqual(stateFromHash("#/"), { activePath: null });
});

test("stateFromHash: an overview address is that screen", () => {
  assert.deepEqual(stateFromHash("#/patterns"), { activePath: "patterns" });
  assert.deepEqual(stateFromHash("#/health"), { activePath: "health" });
});

test("stateFromHash: a file address is that file", () => {
  assert.deepEqual(stateFromHash("#/component/button/content"), {
    activePath: "components/src/button/content.md",
  });
});

test("stateFromHash: an unreadable address is home", () => {
  assert.deepEqual(stateFromHash("#/nonsense/xyz"), { activePath: null });
});

// ---------------------------------------------------------------------------
// Addresses as they actually arrive: from a chat client, a wiki, a person
// retyping one. Every case below was a real defect found in review.
// ---------------------------------------------------------------------------

test("pathFromHash: a trailing slash still resolves", () => {
  // A chat client or wiki auto-linker appending a slash was enough to send the
  // reader to home, and the write effect then overwrote the address they were
  // given, so they could not even read it back.
  assert.equal(
    pathFromHash("#/pattern/forms/"),
    "content/src/patterns/forms.md",
  );
  assert.equal(pathFromHash("#/component/button/"), "workspace/button");
  assert.equal(
    pathFromHash("#/component/button/content/"),
    "components/src/button/content.md",
  );
  assert.equal(pathFromHash("#/drafts/"), "inbox");
});

test("pathFromHash: a tracking query is ignored, not made part of the name", () => {
  assert.equal(
    pathFromHash("#/pattern/forms?utm_source=slack"),
    "content/src/patterns/forms.md",
  );
  assert.equal(
    pathFromHash("#/entity/data-product?x=1"),
    "app-context/src/entities/data-product.md",
  );
});

test("pathFromHash: a slug the app would never mint resolves to home", () => {
  // Not a file that happens to be missing: a shape the app cannot produce. It
  // used to mint `workspace/Button`, which the dispatch refuses, and the write
  // effect then pushed a different broken address over the reader's link.
  assert.equal(pathFromHash("#/component/Button"), null);
  assert.equal(pathFromHash("#/component/foo_bar"), null);
  assert.equal(pathFromHash("#/component/.."), null);
  assert.equal(pathFromHash("#/pattern/Forms"), null);
});

test("pathFromHash: the fallback refuses to escape the repository", () => {
  assert.equal(pathFromHash("#/file/components/src/../README.md"), null);
  assert.equal(pathFromHash("#/file/../secrets"), null);
  assert.equal(pathFromHash("#/file//etc/passwd"), null);
  assert.equal(
    pathFromHash("#/file/components/src/button/tokens.yml"),
    "components/src/button/tokens.yml",
  );
});

test("titleFor: two domains of one component are not the same title", () => {
  assert.equal(
    titleFor("components/src/button/content.md"),
    "Button content · Actian DS Knowledge Editor",
  );
  assert.equal(
    titleFor("components/src/button/usage.md"),
    "Button usage · Actian DS Knowledge Editor",
  );
});

test("titleFor: a screen is NAMED, not derived from its address", () => {
  // Title-casing the URL segment put "Health" in the browser tab above a page
  // headed "Substrate health", and "Accessibility" above "Accessibility
  // coverage". The name comes from SCREEN_TITLE now, and asserting against
  // that map rather than against literals is what keeps this test honest when
  // a screen is renamed.
  for (const [path, title] of Object.entries(SCREEN_TITLE)) {
    assert.equal(
      titleFor(path),
      `${title} \u00b7 Actian DS Knowledge Editor`,
      `${path} is titled from its address rather than its name`,
    );
  }
  assert.equal(titleFor(null), "Actian DS Knowledge Editor");
});

test("corpus: a named address always resolves to something the editor opens", () => {
  // The opposite direction of the gate below it. Without this, the table minted
  // 17 addresses that render the refusal banner, and sharing one handed the
  // reader a link that refuses for everybody.
  const openable = (p: string) =>
    matchFrontmatterForm(p) != null ||
    isPlainMarkdown(p) ||
    /^components\/src\/[^/]+\/_meta\.yml$/.test(p);
  const refused = corpus().filter(
    (p) => !hashFor(p).startsWith("#/file/") && !openable(p),
  );
  assert.deepEqual(refused, [], "these have an address the editor refuses");
});

// ---------------------------------------------------------------------------
// The inverse property, over generated input rather than the corpus.
//
// Three rounds of review found the same defect three times: hashFor and
// pathFromHash are meant to be inverses, and validation kept landing on one
// side only. The corpus gates cannot see it, because they only ever walk the
// 301 files that exist today. These generate the shapes that do not exist yet.
// ---------------------------------------------------------------------------

const SYNTHETIC_PATHS: readonly string[] = [
  // Basenames that are not bare lowercase slugs. None exist today; all are
  // plausible, and each used to mint an address that did not resolve back.
  "accessibility/src/color-contrast-1.4.3.md",
  "accessibility/src/WCAG.md",
  "accessibility/src/focus_order.md",
  "content/src/writing/tone of voice.md",
  "content/src/patterns/café.md",
  "components/src/Button/content.md",
  "components/src/text_input/usage.md",
  "app-context/src/entities/data.product.md",
  // Shapes the table does model, as a control.
  "components/src/button/content.md",
  "content/src/patterns/forms.md",
];

test("inverse: every path either round-trips or takes the fallback, never neither", () => {
  const broken = SYNTHETIC_PATHS.filter((p) => pathFromHash(hashFor(p)) !== p);
  assert.deepEqual(broken, [], "these paths do not survive their own address");
});

test("inverse: a named address always resolves back to the path that minted it", () => {
  // The asymmetry that keeps recurring: hashFor names something pathFromHash
  // then refuses, so the reader's link is silently replaced with home.
  const lying = SYNTHETIC_PATHS.filter((p) => {
    const h = hashFor(p);
    return !h.startsWith("#/file/") && pathFromHash(h) !== p;
  });
  assert.deepEqual(lying, [], "these get a name that does not resolve back");
});

test("inverse: every address the app can mint survives being re-read", () => {
  const unstable = [...corpus(), ...SYNTHETIC_PATHS].filter((p) => {
    const once = hashFor(p);
    const twice = hashFor(pathFromHash(once) ?? "");
    return once !== twice;
  });
  assert.deepEqual(unstable, [], "these addresses change when re-read");
});

test("pathFromHash: an address that arrives percent-encoded still resolves", () => {
  assert.equal(
    pathFromHash(encodeURI("#/file/content/src/writing/tone of voice.md")),
    "content/src/writing/tone of voice.md",
  );
});

test("old addresses keep resolving after the segment swap", () => {
  // MIGRATIONS.md Rule 1, parallel change: a link someone pasted into Slack
  // before the rename must still open the record it named.
  assert.equal(
    pathFromHash("#/feature/import-wizard"),
    "app-context/src/patterns/import-wizard.md",
  );
  assert.equal(
    pathFromHash("#/ux-pattern/import-wizard"),
    "app-context/src/patterns/import-wizard.md",
  );
});

test("a retired segment is never MINTED, only resolved", () => {
  // The trap a single table would create: if `feature` sat in DIRS it would
  // resolve AND mint, so two segments would name one directory and the address
  // the app writes back would differ from the one the reader arrived on.
  // hashFor reads DIRS only; pathFromHash reads both.
  assert.equal(
    hashFor("app-context/src/patterns/import-wizard.md"),
    "#/ux-pattern/import-wizard",
  );
  assert.notEqual(
    hashFor("app-context/src/patterns/import-wizard.md"),
    "#/feature/import-wizard",
  );
});

test("no address changes occupant: #/pattern/ still means content", () => {
  // The regression this locks out. `#/pattern/forms` is a published address
  // (CHANGELOG). Handing the segment to app-context would have resolved every
  // previously-shared link to a file that does not exist — silently, since
  // hashFor mapped the bad path straight back to the same address, so it could
  // not even self-correct. No alias can undo that: DIRS is consulted first.
  assert.equal(pathFromHash("#/pattern/forms"), "content/src/patterns/forms.md");
  assert.equal(hashFor("content/src/patterns/forms.md"), "#/pattern/forms");
});
