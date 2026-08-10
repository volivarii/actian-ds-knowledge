import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../../src");
const baseCss = readFileSync(resolve(SRC, "styles/base.css"), "utf-8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(css|ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// The reading column (measure + gutter) is shared by three surfaces: the preview
// (.md-prose), the WYSIWYG surface ([data-milkdown-root] .ProseMirror) and the
// source pane, whose CM6 theme reads the custom properties from JS rather than
// CSS. That last one is the fragile edge: a var() typo or a rename in base.css
// costs the source pane its measure silently, with no build error and nothing
// visible in a unit test of the component. So assert every --md-* reference
// anywhere in src/ resolves to a property base.css actually declares. Derived by
// scanning, not a hand-maintained list.
test("every --md-* custom property referenced in src/ is declared in base.css", () => {
  const declared = new Set(
    [...baseCss.matchAll(/^\s*(--md-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]),
  );
  assert.ok(
    declared.size > 0,
    "base.css declares no --md-* properties at all; the reading column is gone",
  );

  const dangling: string[] = [];
  let references = 0;
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf-8");
    for (const m of text.matchAll(/var\(\s*(--md-[a-z0-9-]+)/g)) {
      references++;
      if (!declared.has(m[1]))
        dangling.push(`${m[1]} in ${file.slice(SRC.length + 1)}`);
    }
  }
  // Without this the test passes vacuously the day the scan stops matching (a
  // moved file, a changed var() spelling): zero references trivially satisfies
  // "no dangling references". The source pane's two are the ones that matter,
  // since they are the pair no other test would notice going missing.
  assert.ok(
    references >= 2,
    `found only ${references} --md-* references in src/; the scan is not ` +
      "reaching the code it is supposed to check",
  );
  assert.deepEqual(
    dangling,
    [],
    "these --md-* references resolve to nothing, so the surface silently loses " +
      "its reading column",
  );
});

// The toolbar renders inside the same scrolling container as the document, so it
// is pinned with position: sticky. The background and the z-index are not
// decoration: without them the prose scrolls visibly underneath a transparent
// bar. Layout itself cannot be verified here (happy-dom does no layout), so this
// asserts only that the three properties stay together — the plausible
// regression is someone keeping one and dropping another.
test(".md-toolbar keeps position:sticky, a background and a z-index together", () => {
  const rule = /\.md-toolbar\s*\{([^}]*)\}/.exec(baseCss);
  assert.ok(rule, ".md-toolbar rule not found in base.css");
  const body = rule[1] ?? "";
  for (const prop of ["position: sticky", "top:", "z-index:", "background:"]) {
    assert.ok(
      body.includes(prop),
      `.md-toolbar must declare ${prop} — a sticky toolbar without all four ` +
        `either does not pin or lets prose show through it. Rule body:\n${body}`,
    );
  }
});
