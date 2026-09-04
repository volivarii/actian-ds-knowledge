// The instrument's dark palette has to key on the selector the app actually
// produces.
//
// It did not, in every build that has ever shipped. `instrument.css` overrode
// `--ed-lit` under `[data-theme="dark"]`, and nothing in this application sets
// `data-theme`: Radix Themes applies `appearance` as a CLASS on the Theme
// element (`class="radix-themes dark"`). So the block matched nothing,
// `--ed-lit` stayed at its light value #101010, and an AUTHORED cell drew
// near-black on a near-black ground while an ABSENT cell kept its light
// `--ed-well-edge` border. The readout rendered inverted: what was written was
// the invisible half, and what was missing was the prominent half.
//
// No rendering test could catch it. jsdom applies no stylesheet, so the
// cascade this depends on does not exist in the suite, and 1558 tests were
// green over it. It was found by looking at the screen.
//
// So this is a SOURCE guard, and it asserts the JOIN rather than either half:
// a stylesheet keyed on a class nobody emits is exactly as dead as one keyed
// on an attribute nobody sets.
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

test("instrument.css: the dark palette keys on a selector the app emits", () => {
  const selector = darkOverrideSelector();
  // Radix Themes puts `dark` (or `light`) as a class on the Theme element.
  assert.match(
    selector,
    /\.dark\b/,
    `the dark override is keyed on ${selector}, which Radix Themes never produces. ` +
      `appearance="dark" renders class="radix-themes dark"; it sets no data-theme.`,
  );
});

test("instrument.css: the app still asks for the appearance that selector matches", () => {
  // The other half of the join. If the Theme stops passing appearance="dark",
  // or starts reading a user preference, the class above stops being emitted
  // and the palette silently reverts to the light values on a dark ground.
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
