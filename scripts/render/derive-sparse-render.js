"use strict";

// derive-sparse-render.js: what each component renders when the caller asks for
// NOTHING.
//
// WHY THIS EXISTS
//
// #543 filled thirteen empty gallery slots by giving the renderer a literal
// fallback for each one. Every fill turned an OPTIONAL part into an
// unconditional one: `props.Description ? <p> : ""` became a paragraph that
// always says "Support text". The gallery looked better and a capability was
// gone, because the same renderer draws real product screens downstream: a
// caller asking for a page-header with only a title got a description it never
// asked for and could not remove.
//
// #544 moved twelve of those strings out of the renderer and into matrix.js
// SPECIMEN_PROPS, and added an omission test that iterates that map. The
// thirteenth (chat-with-ai-steward's context chip) was not in the map, so the
// test iterated straight past it and stayed green while the defect shipped.
// That is the failure mode this file answers: a guard whose subject is a
// hand-maintained list checks exactly the things somebody remembered.
//
// So the measurement here takes no list. It renders every slug in the render
// contract with NO props at all and counts the elements that carry visible text.
// The property it feeds is stated directly by that number: a component must not
// invent parts the caller did not ask for. A reintroduced literal fallback adds
// a text-bearing element to a sparse render whatever shape it is written in --
// a conditional, a variable initialiser, an `||` chain -- because the render is
// the thing being read, not the source.
//
// The number is NOT a target to drive to zero. 44 of the 58 slugs render some
// visible text with nothing supplied, and most of that is legitimate: a
// spinner's label, a disclaimer, a component whose entire content is structural
// chrome. What must not happen is that the number RISES. The ratchet lives in
// tests/render/sparse-render-ratchet.test.js and compares a fresh measurement
// against this artifact as it stood at the merge base.
//
// HOW EACH FACT IS DERIVED (nothing here is hand-maintained)
//
//   slugs    the render contract's own key set, from derive-contract.js, which
//            reads the `case "<slug>":` branches in the renderer
//   bySlug   MEASURED: the slug rendered with `props: {}` and no variant, then
//            counted. Nothing is read out of the source.

var fs = require("node:fs");
var path = require("node:path");

var REPO_ROOT = path.resolve(__dirname, "..", "..");
var RENDERER_DIR = path.join(REPO_ROOT, "components", "render", "renderer");
var OUT_REL = "components/render/dist/sparse-render.json";
var OUT_PATH = path.join(REPO_ROOT, OUT_REL);

var contractDerive = require(path.join(__dirname, "derive-contract.js"));
var dsMap = require(
  path.join(RENDERER_DIR, "html-renderers", "ds-html-map.js"),
);

var SCHEMA_VERSION = "1.0.0";

// Elements that never open a scope, so text after them belongs to their parent.
// A `<input>` followed by a chip label is the exact shape this gets wrong when
// the list is short: the chip's text would be attributed to the input, which
// never closes, and every later sibling would be swallowed with it.
var VOID_ELEMENTS = {
  area: true,
  base: true,
  br: true,
  col: true,
  embed: true,
  hr: true,
  img: true,
  input: true,
  link: true,
  meta: true,
  param: true,
  source: true,
  track: true,
  wbr: true,
};

function isVisible(chunk) {
  return chunk.replace(/&nbsp;/g, " ").replace(/\s+/g, "").length > 0;
}

// The number of ELEMENTS that directly carry visible text, not the number of
// text runs and not the length of the text. Elements, because that is the unit a
// reader sees as "a part": one <p> with a sentence in it is one part whether the
// sentence is long or short, so ordinary copy edits do not move this number and
// a NEW part always does.
//
// Attribute values are deliberately not counted. A placeholder is visible in a
// browser, but it is a property of an element that already exists rather than an
// element the renderer invented, and counting attributes would make the number
// move whenever an aria-label was reworded. tests/render/helpers/empty-slots.js
// measures text the same way, so the two gates agree about what text is.
//
// <svg>, <script> and <style> content is dropped: an icon's geometry is not a
// part, and an icon that carried a <title> would otherwise count as one.
function textBearingElements(html) {
  var src = String(html)
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  var re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
  var stack = [];
  var count = 0;
  var last = 0;
  var m;

  function note(chunk) {
    if (!isVisible(chunk)) return;
    if (!stack.length) {
      // Bare text at the top level of a fragment. It is still a visible part, so
      // it counts; silently dropping it would let a renderer emit copy outside
      // any element and stay invisible to this measurement.
      count += 1;
      return;
    }
    var top = stack[stack.length - 1];
    if (top.hasText) return;
    top.hasText = true;
    count += 1;
  }

  while ((m = re.exec(src)) !== null) {
    note(src.slice(last, m.index));
    last = m.index + m[0].length;
    var name = m[1].toLowerCase();
    if (m[0].charAt(1) === "/") {
      // Unwind to the matching open tag. Unbalanced markup pops to the nearest
      // match rather than throwing: this is a measurement, and refusing to count
      // a fragment would read as zero parts, which is the wrong direction to be
      // wrong in.
      for (var i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === name) {
          stack.length = i;
          break;
        }
      }
    } else if (!VOID_ELEMENTS[name] && !/\/\s*$/.test(m[2])) {
      stack.push({ tag: name, hasText: false });
    }
  }
  note(src.slice(last));
  return count;
}

function loadJson(rel, key) {
  try {
    return require(path.join(REPO_ROOT, rel))[key] || {};
  } catch (e) {
    return {};
  }
}

function renderSparse(slug) {
  return String(
    dsMap.renderDSComponent({
      type: "INSTANCE",
      library: "ds",
      dsSlug: slug,
      variant: "",
      props: {},
    }),
  );
}

// Icons and artwork are supplied when present but their absence is tolerated,
// unlike derive-contract.js, which must refuse to run without them. The reason
// is not tolerance for its own sake: renderIcon() returns the empty string for a
// glyph it does not have, so no asset can add or remove a text-bearing element,
// and the sparse counts are identical with and without them. That claim is
// asserted in tests/render/sparse-render-ratchet.test.js rather than asserted
// here in a comment, so the day an asset renderer grows a text fallback the
// tolerance stops being true and something says so.
function measureSparse(options) {
  var opts = options || {};
  var slugs =
    opts.slugs ||
    Object.keys(contractDerive.deriveContract(opts.contractOptions).slugs);

  dsMap.setIcons(
    opts.icons || loadJson("components/dist/icons/icons.json", "icons"),
  );
  dsMap.setGraphics(
    opts.graphics ||
      loadJson("components/dist/graphics/graphics.json", "graphics"),
  );
  var bySlug = {};
  try {
    slugs
      .slice()
      .sort()
      .forEach(function (slug) {
        // A slug that throws is NOT skipped. A skip shrinks the measured surface
        // while the artifact still looks complete, which is the shape that let a
        // broken sync take the emptiness probe from 58 slugs to 28 with the gate
        // green. Refusing to write is recoverable; publishing a smaller truth is
        // not.
        bySlug[slug] = textBearingElements(renderSparse(slug));
      });
  } finally {
    dsMap.setIcons(null);
    dsMap.setGraphics(null);
  }

  var slugNames = Object.keys(bySlug);
  return {
    _meta: {
      auto_generated: true,
      source:
        "components/render/renderer/html-renderers/ds-html-map.js, rendered with no props",
      do_not_edit:
        "Regenerate with `npm run derive:render`. Hand edits are overwritten.",
    },
    schemaVersion: SCHEMA_VERSION,
    generatedBy: "scripts/render/derive-sparse-render.js",
    totals: {
      slugs: slugNames.length,
      slugsWithText: slugNames.filter(function (s) {
        return bySlug[s] > 0;
      }).length,
      textBearingElements: slugNames.reduce(function (n, s) {
        return n + bySlug[s];
      }, 0),
    },
    bySlug: bySlug,
  };
}

function writeSparse(outPath) {
  var target = outPath || OUT_PATH;
  fs.writeFileSync(target, JSON.stringify(measureSparse(), null, 2) + "\n");
  return target;
}

// The slug list, the markup and the assets all come from the contract derive's
// own inputs, so the two derives are watched by one declaration rather than by
// two lists that can disagree. tests/render/derive-contract.test.js asserts
// render-derive.yml watches every entry.
var INPUTS = contractDerive.INPUTS;

module.exports = {
  measureSparse: measureSparse,
  writeSparse: writeSparse,
  textBearingElements: textBearingElements,
  INPUTS: INPUTS,
  OUT_PATH: OUT_PATH,
  OUT_REL: OUT_REL,
};

if (require.main === module) {
  var written = writeSparse(process.argv[2]);
  var out = JSON.parse(fs.readFileSync(written, "utf8"));
  process.stdout.write(
    "sparse render: " +
      out.totals.slugsWithText +
      " of " +
      out.totals.slugs +
      " slugs render visible text with no props supplied, " +
      out.totals.textBearingElements +
      " text-bearing elements in total -> " +
      path.relative(REPO_ROOT, written) +
      "\n",
  );
}
