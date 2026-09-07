// A span promoted to a button has to be VISIBLE once focus reaches it.
//
// The app turns spans and divs into buttons with `role="button"` in several
// places. Radix's reset drops the UA focus ring, and the only `:focus-visible`
// rule in the app was the skip link's, so every one of them was
// keyboard-reachable and invisible once reached: focus landed and nothing on
// screen moved. Keyboard-reachable is half the fix.
//
// The inventory is DERIVED below rather than written down. It was written down
// as "nine sites in five components" in three places at once, and the sites are
// ten: a naive grep says eleven because Sidebar.tsx explains the technique in a
// block comment. A number restated in prose and gated by nothing is how the
// three copies drift.
//
// Asserts the JOIN, not a computed style: the test environment does not load
// base.css, so `getComputedStyle` here would read the default whether the rule
// exists or not, and the gate could not fail on its subject. So this checks
// that the elements carry the role, and that the stylesheet the app loads has a
// rule keyed on it.
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { PatternsDashboard } from "../../src/app/PatternsDashboard";

afterEach(() => cleanup());

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "src");
const BASE_CSS = join(SRC, "styles", "base.css");

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

const APP_CONTEXT = {
  apps: { studio: { label: "Studio", sidebar: [], useCases: [] } },
  patterns: {
    "asset-detail-360": {
      label: "Asset detail 360",
      apps: ["studio"],
      when: "Use for a single asset.",
      components: ["tabs"],
    },
  },
  entities: {},
  terminology: {},
};

const gh = {
  repos: {
    getContent: async ({ path }: { path: string }) => {
      if (path === "app-context/dist/recipes") return { data: [] };
      if (path === "app-context/dist/app-context.json")
        return {
          data: {
            content: b64(JSON.stringify(APP_CONTEXT)),
            encoding: "base64",
          },
        };
      const e = new Error("not found") as Error & { status: number };
      e.status = 404;
      throw e;
    },
  },
} as never;

test("base.css gives a role=button element a visible focus ring", () => {
  const css = readFileSync(BASE_CSS, "utf8");
  // Pinned to the BARE selector. `g[role="button"]:focus-visible { outline: none }`
  // sits a few lines below and contains this substring, so an unanchored match
  // would read the SVG rule's body and report the opposite of the truth the day
  // the two are reordered.
  const rule = /(?<![\w-])\[role="button"\]:focus-visible\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, "base.css has no :focus-visible rule for role=button");
  assert.match(
    rule[1] ?? "",
    /outline:\s*\d/,
    "the rule exists but sets no outline width, so focus is still invisible",
  );
  // The offset has to be negative. The sidebar rail is `overflow: auto` and its
  // rows fill its width, so a ring drawn outside their box is clipped to the
  // top and bottom edges. A positive offset restores that silently: the rule
  // still exists, the ring still "draws", and four of the ten sites show half
  // of one.
  assert.match(
    rule[1] ?? "",
    /outline-offset:\s*-\d/,
    "the ring is drawn outside the element, where the sidebar clips it",
  );
  // And it must not set border-radius: that beats `.rt-Badge` on specificity
  // and turns a capture chip from a pill into a rectangle while focused.
  assert.ok(
    !/border-radius/.test(rule[1] ?? ""),
    "the focus rule reshapes the element instead of only ringing it",
  );
  // `outline: none` would satisfy "has an outline property" while restoring the
  // exact bug. The width has to be real.
  assert.ok(
    !/outline:\s*(none|0)\b/.test(rule[1] ?? ""),
    "the focus rule removes the outline rather than drawing one",
  );
});

test("the catalogue renders elements the focus rule can reach", () => {
  // The rule above protects nothing if no element carries the role. This is the
  // other half of the join, and it is the half that broke: the pattern name was
  // a plain span with an onClick for the life of the grouped layout.
  return (async () => {
    render(
      <Theme>
        <PatternsDashboard octokit={gh} onOpenFile={() => {}} />
      </Theme>,
    );
    await waitFor(() => screen.getByText("Asset detail 360"));
    const name = screen.getByText("Asset detail 360");
    assert.equal(name.getAttribute("role"), "button");
    assert.equal(name.getAttribute("tabindex"), "0");
  })();
});

test("every role=button site in src is covered by a rule that reaches it", () => {
  // A real <button> gets a focus ring from Radix. The rule added to base.css is
  // for the elements that do NOT, and this walks the source so a new site
  // cannot quietly rely on a ring it does not get. If this ever fails because
  // somebody put role="button" on a real button, the fix is to delete the
  // redundant role, not to widen this test.
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".tsx")) files.push(p);
    }
  };
  walk(SRC);
  const css = readFileSync(BASE_CSS, "utf8");
  const sites: string[] = [];
  const svgSites: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    // Attribute uses only. A block comment in Sidebar.tsx explains the
    // technique and contains the string, and counting it is how a hand count
    // of these sites goes wrong in the first place.
    const attrs = text.match(/(?<!\*\s{0,80})role="button"/g) ?? [];
    const n = attrs.length;
    if (n === 0) continue;
    sites.push(`${f.slice(SRC.length + 1)} x${n}`);
    // A real <button> already gets a ring from Radix, so a role on one would
    // make the base.css rule look necessary when it is not.
    assert.ok(
      !/<button[^>]*role="button"/.test(text),
      `${f} puts role="button" on a real button`,
    );
    // An SVG container gets no painted outline in WebKit and its box is the
    // whole bbox, label included, so it needs the stroke rule instead.
    if (/<g\b[^>]*role="button"/.test(text)) {
      svgSites.push(f.slice(SRC.length + 1));
    }
  }
  assert.ok(
    sites.length > 0,
    "no role=button site left in src, so the base.css rule is now dead code",
  );
  // Every SVG site is served by the stroke rule, not the outline rule. If a new
  // one appears, this fails rather than letting it inherit a rule that does not
  // paint where it lives.
  for (const site of svgSites) {
    assert.match(
      css,
      /g\[role="button"\]:focus-visible circle\s*\{[^}]*stroke:/,
      `${site} focuses an SVG <g>, which the outline rule cannot ring; base.css has no stroke rule for it`,
    );
  }
  assert.ok(
    svgSites.length > 0,
    "no SVG role=button site left, so the stroke rule in base.css is dead code",
  );
});
