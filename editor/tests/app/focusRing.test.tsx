// A span promoted to a button has to be VISIBLE once focus reaches it.
//
// The app turns spans and divs into buttons with `role="button"` in nine places
// across five components. Radix's reset drops the UA focus ring, and the only
// `:focus-visible` rule in the app was the skip link's, so all nine were
// keyboard-reachable and invisible once reached: focus landed and nothing on
// screen moved. Keyboard-reachable is half the fix.
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
  const rule = /\[role="button"\]:focus-visible\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, "base.css has no :focus-visible rule for role=button");
  assert.match(
    rule[1] ?? "",
    /outline:\s*\d/,
    "the rule exists but sets no outline width, so focus is still invisible",
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

test("every role=button in src is a span or div, so none of them is exempt", () => {
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
  const sites: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const n = (text.match(/role="button"/g) ?? []).length;
    if (n > 0) sites.push(`${f.slice(SRC.length + 1)} x${n}`);
    // A `<button ... role="button">` is the one shape that would make the rule
    // above look necessary when it is not.
    assert.ok(
      !/<button[^>]*role="button"/.test(text),
      `${f} puts role="button" on a real button`,
    );
  }
  assert.ok(
    sites.length > 0,
    "no role=button site left in src, so the base.css rule is now dead code",
  );
});
