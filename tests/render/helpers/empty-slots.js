"use strict";

// Surface-measured hollowness. For every matrix cell times every contract prop:
// render the cell with a sentinel injected into that prop. If the sentinel does
// not reach the markup the prop is not a visible text slot (a boolean, an enum,
// an icon name), so it is skipped. If it does reach the markup, render the cell
// again without it: when removing the sentinel leaves the cell's text unchanged,
// the slot contributes nothing of its own and renders EMPTY.
//
// Measured at the surface on purpose. derive-contract.js extracts defaults with
// a regex and documents 13 props it cannot see (the parseItems callee-argument
// shape, variable fallbacks), so a check keyed on the contract's static default
// field would report those as missing when the renderer supplies them.

const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SENTINEL = "ZZPROBEZZ";

function textOf(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function emptyTextSlots() {
  const dsMap = require(
    path.join(
      REPO_ROOT,
      "components/render/renderer/html-renderers/ds-html-map.js",
    ),
  );
  const matrix = require(
    path.join(REPO_ROOT, "components/render/renderer/matrix.js"),
  );
  const contract = require(
    path.join(REPO_ROOT, "components/render/dist/render-contract.json"),
  );

  dsMap.setIcons(
    require(path.join(REPO_ROOT, "components/dist/icons/icons.json")),
  );
  try {
    dsMap.setGraphics(
      require(path.join(REPO_ROOT, "components/dist/graphics/graphics.json")),
    );
  } catch (e) {
    // graphics are optional, same tolerance derive-from-renderer.js applies
  }

  const render = function (slug, variant, props) {
    return dsMap.renderDSComponent({
      type: "INSTANCE",
      library: "ds",
      dsSlug: slug,
      variant: variant,
      props: props,
    });
  };

  const seen = new Set();
  const empty = [];
  const slugsWithTextProps = [];
  // Every slug the probe could not reach, and why. Both call sites below can
  // throw, and both used to swallow it and move on, so a sync that broke 30
  // slugs shrank coverage from 58 to 28 with the gate still green: the loop
  // body simply stopped executing for them. Reported so the caller can assert
  // this list is empty and name the casualties rather than measuring only that
  // SOMETHING was probed.
  const skipped = [];
  const skippedSeen = new Set();
  const noteSkip = function (slug, reason) {
    if (skippedSeen.has(slug)) return;
    skippedSeen.add(slug);
    skipped.push({ slug: slug, reason: reason });
  };
  let probed = 0;

  Object.keys(contract.slugs).forEach(function (slug) {
    const props = contract.slugs[slug].props || [];
    if (!props.length) return;
    let cells;
    try {
      cells = matrix.variantMatrix(slug);
    } catch (e) {
      noteSkip(slug, "variantMatrix threw: " + (e && e.message));
      return;
    }
    let slugHasTextProp = false;

    cells.forEach(function (cell) {
      const cellProps = cell.props || {};
      const plain = textOf(render(slug, cell.variant, cellProps));

      props.forEach(function (p) {
        const withProbe = Object.assign({}, cellProps);
        withProbe[p.name] = SENTINEL;
        let probedText;
        try {
          probedText = textOf(render(slug, cell.variant, withProbe));
        } catch (e) {
          noteSkip(
            slug,
            "render threw on " +
              p.name +
              " @ " +
              cell.variant +
              ": " +
              (e && e.message),
          );
          return;
        }
        if (!probedText.includes(SENTINEL)) return;

        probed += 1;
        slugHasTextProp = true;
        const stripped = probedText
          .split(SENTINEL)
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        if (stripped !== plain) return;

        const key = slug + "." + p.name;
        if (seen.has(key)) return;
        seen.add(key);
        empty.push({ slug: slug, prop: p.name });
      });
    });

    if (slugHasTextProp) slugsWithTextProps.push(slug);
  });

  empty.sort(function (a, b) {
    return a.slug.localeCompare(b.slug) || a.prop.localeCompare(b.prop);
  });
  skipped.sort(function (a, b) {
    return a.slug.localeCompare(b.slug);
  });
  return {
    empty: empty,
    probed: probed,
    slugsWithTextProps: slugsWithTextProps,
    skipped: skipped,
  };
}

module.exports = { emptyTextSlots: emptyTextSlots, SENTINEL: SENTINEL };
