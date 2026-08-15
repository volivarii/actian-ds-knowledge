"use strict";

// The regression this file exists for. #543 filled twelve empty gallery slots by
// giving the renderer a literal fallback for each one, which turned an OPTIONAL
// element into an unconditional one: `props.Description ? <p> : ""` became a
// paragraph that always renders "Support text". The gallery looked right and the
// capability was gone. A caller asking for a page-header with only a title got a
// description it never asked for and could not remove, and the plugin's suite
// said so in three behavioural failures.
//
// So the assertion here is the one the fill removed: WITHOUT the prop, the slot's
// element must not be in the markup at all. The specimen strings now live in
// matrix.js SPECIMEN_PROPS, and the list of slots is READ from that map rather
// than written out a second time here, so a slot added there is covered here on
// the same commit and a slot removed there cannot leave a stale name behind.
//
// The element's own CSS class is what is asserted, not the rendered text: a text
// match can be satisfied by the same string rendered somewhere else in the same
// component (input-date's helper and its placeholder both read MM/DD/YYYY). The
// class is DERIVED too, by probing the prop with a sentinel and reading the class
// off the element the sentinel lands in, so no per-slot class is hand-written
// either. A slot whose class cannot be derived is reported, not skipped.

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const dsMap = require(
  path.join(
    REPO_ROOT,
    "components/render/renderer/html-renderers/ds-html-map.js",
  ),
);
const matrix = require(
  path.join(REPO_ROOT, "components/render/renderer/matrix.js"),
);

dsMap.setIcons(
  require(path.join(REPO_ROOT, "components/dist/icons/icons.json")),
);
try {
  dsMap.setGraphics(
    require(path.join(REPO_ROOT, "components/dist/graphics/graphics.json")),
  );
} catch (e) {
  // graphics are optional, same tolerance the other render tests apply
}

const SENTINEL = "ZZPROBEZZ";

const SLOTS = Object.keys(matrix.SPECIMEN_PROPS)
  .sort()
  .reduce(function (acc, slug) {
    Object.keys(matrix.SPECIMEN_PROPS[slug])
      .sort()
      .forEach(function (prop) {
        acc.push({ slug: slug, prop: prop });
      });
    return acc;
  }, []);

function firstCell(slug) {
  return matrix.variantMatrix(slug)[0];
}

function render(slug, cell, props) {
  return String(
    dsMap.renderDSComponent({
      type: "INSTANCE",
      library: "ds",
      dsSlug: slug,
      variant: cell.variant,
      props: props,
    }),
  );
}

function withProp(props, prop, value) {
  const out = Object.assign({}, props);
  out[prop] = value;
  return out;
}

function withoutProp(props, prop) {
  const out = Object.assign({}, props);
  delete out[prop];
  return out;
}

// The class of the element the prop's value lands in: put a sentinel in the
// prop, find it in the markup, and read the class attribute off the opening tag
// immediately before it. The BEM element token (the one containing "__") is
// preferred over the block token, because a button carries `ds-button` too and
// that one is shared with every other button in the fragment.
//
// The first occurrence is NOT necessarily the slot. A prop often feeds an
// attribute as well as an element, and the attribute comes first: popover's
// Title is the root div's aria-label before it is the header's title span, so
// reading back from occurrence one resolves the class `ds-popover`, which the
// component always emits, and the omission check then fails on a slot that is
// correctly omitted. Occurrences inside a tag are skipped for that reason.
function slotClass(slug, cell, prop) {
  const html = render(slug, cell, withProp(cell.props, prop, SENTINEL));
  let at = html.indexOf(SENTINEL);
  while (at !== -1) {
    const open = html.lastIndexOf("<", at);
    const close = html.lastIndexOf(">", at);
    if (close > open) {
      // Between a `>` and the next `<`, i.e. real text content, so `open` is the
      // start of the enclosing element's own opening tag.
      const attr = /class="([^"]*)"/.exec(html.slice(open, close));
      if (attr) {
        const tokens = attr[1].split(/\s+/).filter(Boolean);
        const bem = tokens.filter(function (t) {
          return t.indexOf("__") !== -1;
        });
        return bem[bem.length - 1] || tokens[tokens.length - 1] || null;
      }
    }
    at = html.indexOf(SENTINEL, at + SENTINEL.length);
  }
  return null;
}

test("every specimen slot names a slug the renderer implements", function () {
  const unknown = Object.keys(matrix.SPECIMEN_PROPS).filter(function (slug) {
    return matrix.RENDER_SLUGS.indexOf(slug) === -1;
  });
  assert.deepEqual(
    unknown,
    [],
    "SPECIMEN_PROPS names slugs with no renderer branch, so their content " +
      "reaches nothing: " +
      JSON.stringify(unknown),
  );
});

// Non-vacuity, and the reason it is not a hardcoded 12: an emptied or renamed
// SPECIMEN_PROPS would leave the per-slot tests below with nothing to iterate and
// the file would go green having asserted nothing at all.
test("there are specimen slots to check", function () {
  assert.ok(
    SLOTS.length > 0,
    "SPECIMEN_PROPS is empty, so every per-slot assertion below iterated over " +
      "nothing and this file proves nothing",
  );
});

test("every specimen slot resolves to an element of its own", function () {
  const unresolved = SLOTS.filter(function (s) {
    return !slotClass(s.slug, firstCell(s.slug), s.prop);
  }).map(function (s) {
    return s.slug + "." + s.prop;
  });
  assert.deepEqual(
    unresolved,
    [],
    "these specimen props never reached the markup, so the omission checks " +
      "below could not tell an omitted element from a prop the renderer does " +
      "not read: " +
      JSON.stringify(unresolved),
  );
});

SLOTS.forEach(function (slot) {
  test(
    slot.slug + " omits its " + slot.prop + " element when the prop is absent",
    function () {
      const cell = firstCell(slot.slug);
      const cls = slotClass(slot.slug, cell, slot.prop);
      assert.ok(
        cls,
        slot.slug + "." + slot.prop + " resolved no element class",
      );

      // The gallery keeps its content: the matrix cell carries the specimen
      // value, so the element IS there. Without this half, the check below could
      // be satisfied by a renderer that never emits the element at all.
      assert.ok(
        render(slot.slug, cell, cell.props).indexOf(cls) !== -1,
        slot.slug +
          " renders no ." +
          cls +
          " even with its specimen prop, so SPECIMEN_PROPS no longer fills " +
          "this slot in the gallery",
      );

      assert.equal(
        render(slot.slug, cell, withoutProp(cell.props, slot.prop)).indexOf(
          cls,
        ),
        -1,
        slot.slug +
          " renders ." +
          cls +
          " with no " +
          slot.prop +
          " prop supplied, so a caller cannot render this component without " +
          "that optional part. Specimen content belongs in matrix.js " +
          "SPECIMEN_PROPS, not in a literal fallback in ds-html-map.js",
      );
    },
  );
});
