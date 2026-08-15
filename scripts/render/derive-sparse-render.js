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
// So the measurements here take no list. Both render every slug in the render
// contract and read the answer off the markup, never off the source.
//
// TWO MEASUREMENTS, AND EXACTLY WHAT EACH ONE GUARANTEES
//
// `bySlug` counts the elements carrying visible text in a render with no props.
// What it catches is precisely a fallback that adds a NEW text-bearing element,
// in whichever shape it is written: a conditional element, a variable
// initialised to a literal, an `||` chain. What it does NOT catch, stated
// plainly because a gate believed to cover more than it does is worse than no
// gate:
//
//   - text injected into an element that ALREADY carries text. An element is
//     counted once, so turning `New chat` into `New chat on Customer Orders`
//     leaves the count untouched. Measured, not assumed: the fallback the
//     review used as an exploit moves this number by zero.
//   - a fallback carried by an ATTRIBUTE (`placeholder=`, `aria-label=`,
//     `alt=`). Attribute values are not text nodes and are not counted.
//   - text inside `<svg>`, including `<title>`, which is stripped before
//     counting so icon geometry cannot read as a part.
//
// `inventedSlots` is the complement that closes those three. For every
// (slug, prop) in the contract it renders the slug twice, once with nothing and
// once with a sentinel in that prop, then removes the sentinel from the second
// render. Supplying a prop may only ADD to the markup: if the sentinel render
// with the sentinel taken out no longer contains everything the empty render
// had, then the prop DISPLACED something the renderer had invented for it, and
// a caller cannot get the component without that content. That comparison is
// over raw HTML, so it sees attributes and svg text as readily as text nodes,
// and it sees injection into an existing element because the injected literal
// disappears from the markup when the prop is supplied.
//
// Neither number is a target. 44 of the 58 slugs render some visible text with
// nothing supplied, and many props genuinely have a designed fallback; most of
// both sets is legitimate. What must not happen is that they GROW. The ratchet
// lives in tests/render/sparse-render-ratchet.test.js and compares a fresh
// measurement against this artifact as it stood at the merge base.
//
// HOW EACH FACT IS DERIVED (nothing here is hand-maintained)
//
//   slugs          the render contract's own key set, from derive-contract.js,
//                  which reads the `case "<slug>":` branches in the renderer
//   bySlug         MEASURED: the slug rendered with `props: {}` and no variant,
//                  then counted
//   inventedSlots  MEASURED: the two renders above, compared

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

// ONE probe, shared. tests/render/helpers/empty-slots.js renders through these
// too, so the sentinel, the asset loading and the call shape exist once: a
// second copy is how two gates end up disagreeing about what they rendered.
//
// Icons and artwork are supplied when present but their absence is tolerated,
// unlike derive-contract.js, which must refuse to run without them. The reason
// is not tolerance for its own sake: renderIcon() returns the empty string for a
// glyph it does not have, so no asset can add or remove a text-bearing element,
// and the sparse counts are identical with and without them. That claim is
// asserted in tests/render/sparse-render-ratchet.test.js rather than asserted
// here in a comment, so the day an asset renderer grows a text fallback the
// tolerance stops being true and something says so.
var SENTINEL = "ZZPROBEZZ";

function loadAssets(options) {
  var opts = options || {};
  dsMap.setIcons(
    opts.icons || loadJson("components/dist/icons/icons.json", "icons"),
  );
  dsMap.setGraphics(
    opts.graphics ||
      loadJson("components/dist/graphics/graphics.json", "graphics"),
  );
}

function releaseAssets() {
  dsMap.setIcons(null);
  dsMap.setGraphics(null);
}

function render(slug, variant, props) {
  return String(
    dsMap.renderDSComponent({
      type: "INSTANCE",
      library: "ds",
      dsSlug: slug,
      variant: variant || "",
      props: props || {},
    }),
  );
}

// "Supplying a prop may only ADD to the markup." Character-level subsequence,
// which is the cheap exact statement of that: `whole` contains every character
// of `part` in order, so `part` can be recovered from it by insertions alone.
//
// Insertion-only is what an honestly optional slot looks like: with the prop
// absent the element is missing, with it present and then blanked the element is
// there but empty, and the empty render survives inside the fuller one. A
// fallback is the opposite: the literal is present with the prop absent and gone
// once the prop is supplied, so something the empty render had cannot be found
// any more. A diff would answer the same question; this answers it in one pass
// with no dependency, and on the render sizes here it costs microseconds.
function isSubsequence(part, whole) {
  var i = 0;
  for (var j = 0; j < whole.length && i < part.length; j++) {
    if (part.charCodeAt(i) === whole.charCodeAt(j)) i++;
  }
  return i === part.length;
}

// The (slug, prop) pairs where supplying the prop takes content away, i.e. the
// renderer had invented something for it. Both renders are sparse (no other
// props), so what is compared is the prop's own contribution.
function inventedFor(slug, props) {
  var empty = render(slug, "", {});
  var out = [];
  props.forEach(function (prop) {
    var probed = {};
    probed[prop] = SENTINEL;
    var withProp = render(slug, "", probed);
    // A prop whose value never reaches the markup is not a content slot at all
    // (a boolean, an enum the renderer only compares against). Its render can
    // differ for reasons that have nothing to do with invented content, so it is
    // not a subject here. The same skip the emptiness probe applies.
    if (withProp.indexOf(SENTINEL) === -1) return;
    if (!isSubsequence(empty, withProp.split(SENTINEL).join(""))) {
      out.push(slug + "." + prop);
    }
  });
  return out;
}

function measureSparse(options) {
  var opts = options || {};
  var contract =
    opts.contract || contractDerive.deriveContract(opts.contractOptions);
  var slugs = opts.slugs || Object.keys(contract.slugs);
  var propsOf = function (slug) {
    var entry = (contract.slugs || {})[slug];
    return ((entry && entry.props) || []).map(function (p) {
      return p.name;
    });
  };

  loadAssets(opts);
  var bySlug = {};
  var invented = [];
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
        bySlug[slug] = textBearingElements(render(slug, "", {}));
        invented = invented.concat(inventedFor(slug, propsOf(slug)));
      });
  } finally {
    releaseAssets();
  }
  invented.sort();

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
      inventedSlots: invented.length,
    },
    bySlug: bySlug,
    inventedSlots: invented,
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
  isSubsequence: isSubsequence,
  // The shared probe: one sentinel, one asset load, one call shape, used by
  // tests/render/helpers/empty-slots.js as well.
  SENTINEL: SENTINEL,
  loadAssets: loadAssets,
  releaseAssets: releaseAssets,
  render: render,
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
      " text-bearing elements in total; " +
      out.totals.inventedSlots +
      " (slug, prop) pairs displace content the renderer invented -> " +
      path.relative(REPO_ROOT, written) +
      "\n",
  );
}
