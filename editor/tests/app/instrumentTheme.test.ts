// The instrument's dark palette has to key on a selector the app actually
// produces, and this file exists because I once got that wrong in both
// directions on the same day.
//
// What the app produces, read out of the running editor rather than recalled:
// `<Theme appearance="dark">` renders `class="radix-themes dark"` on the Theme
// element, and because that Theme is the ROOT theme, Radix ALSO stamps
// `data-theme="dark"` on `<html>`. A rule keyed on `[data-theme="dark"]` alone
// matches, and `--ed-lit` resolves to the dark #f2f0eb.
//
// The correction. This file used to open by asserting that nothing in the
// application sets `data-theme`, that the block therefore matched nothing in
// every build ever shipped, and that the readout had been rendering INVERTED
// throughout. That was measured on a throwaway dogfood page which mounts the
// screen without the app's root Theme, so `<html>` carried no stamp there. The
// measurement was real and the surface was not the app: the shipped editor
// stamps the attribute, and the pre-#659 selector applied.
//
// 🔑 A measurement taken on a stand-in surface describes the stand-in. The
// stand-in exists precisely because it is cheaper than the app, and what it
// leaves out is exactly what makes it cheaper.
//
// The selector is still `:is(.dark, [data-theme="dark"])`, and that is not a
// leftover. The two halves FAIL APART: a Theme that stops being the root theme
// keeps the class and loses the `<html>` stamp, and a theme switch written
// outside Radix would set the attribute and no class. So this asserts the JOIN
// on both halves, because a stylesheet keyed on a class nobody emits is exactly
// as dead as one keyed on an attribute nobody sets, and the suite is
// structurally blind to either: jsdom applies no stylesheet, so the cascade
// this depends on does not exist here at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const CSS = readFileSync(join(SRC, "styles", "instrument.css"), "utf8");
const APP = readFileSync(join(SRC, "App.tsx"), "utf8");

/** The selector of the rule block that redefines `--ed-lit`. */
function darkOverrideSelector(): string {
  // Every block, as selector + body. The dark one is whichever redefines
  // --ed-lit and is not the bare :root that declares it first.
  const blocks = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.replace(/\/\*[\s\S]*?\*\//g, "").trim(),
    body: m[2]!,
  }));
  const overriding = blocks.filter((b) => /--ed-lit\s*:/.test(b.body));
  assert.ok(
    overriding.length >= 2,
    `expected a base declaration and a dark override of --ed-lit, found ${overriding.length}`,
  );
  const dark = overriding.find((b) => b.selector !== ":root");
  assert.ok(dark, "--ed-lit is declared but never overridden for dark");
  return dark!.selector;
}

test("instrument.css: the dark palette keys on both selectors the app emits", () => {
  const selector = darkOverrideSelector();
  // The class, on the Theme element.
  assert.match(
    selector,
    /\.dark\b/,
    `the dark override is keyed on ${selector}, which drops the class Radix ` +
      `Themes puts on the Theme element: appearance="dark" renders ` +
      `class="radix-themes dark". A nested Theme emits this and no <html> stamp.`,
  );
  // The attribute, on <html>, because this Theme is the root theme.
  assert.match(
    selector,
    /\[data-theme="dark"\]/,
    `the dark override is keyed on ${selector}, which drops the attribute Radix ` +
      `stamps on <html> for a root theme. Keeping only the class is what breaks ` +
      `if the readout is ever rendered under a plain root-level theme switch.`,
  );
});

test("instrument.css: the app still asks for the appearance that selector matches", () => {
  // The other half of the join. If the Theme stops passing appearance="dark",
  // or starts reading a user preference, NEITHER the class nor the <html> stamp
  // is emitted, and the palette silently reverts to the light values on a dark
  // ground. This is the half that was true all along.
  assert.match(
    APP,
    /<Theme[^>]*appearance="dark"/,
    'App.tsx no longer renders <Theme appearance="dark">, so the .dark class ' +
      "instrument.css keys on is no longer guaranteed to exist",
  );
});

test("instrument.css: the dark override actually moves the readout values", () => {
  // A block with the right selector and an empty body would pass the guard
  // above and still render inverted. These three are what make a lit cell
  // legible on a dark ground.
  const selector = darkOverrideSelector();
  const block = CSS.slice(CSS.indexOf(selector) + selector.length);
  const body = block.slice(block.indexOf("{") + 1, block.indexOf("}"));
  for (const prop of ["--ed-lit", "--ed-well-edge", "--ed-legend"]) {
    assert.match(
      body,
      new RegExp(`${prop}\\s*:`),
      `${prop} is not overridden for dark`,
    );
  }
});
