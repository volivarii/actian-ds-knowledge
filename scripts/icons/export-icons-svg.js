"use strict";

// Extracts SVG for the monochrome UI icons (registry category "Icons", primary
// group ≠ "Connector") from Figma, normalizes them, and writes:
//   - autoOutPath      : components/src/icons-svg.auto.json  (clean set)
//   - degradedOutPath  : components/dist/icons/icons.degraded.json (worklist)
// Returns { exported:[slug], degraded:[{slug,reason}], ghosts:[slug],
//           skipped:Number, wrote:Boolean }.
// `ghosts` are registry entries whose Figma node no longer exists (verified via
// /v1/files/:key/nodes, not inferred). Thin glue over the tested figma-rest
// client + normalize-svg.

const fs = require("node:fs");
const path = require("node:path");
const { primaryGroup } = require("./derive-icons-svg");
const { normalizeIconSvg } = require("./normalize-svg");

async function run(opts) {
  const registry = opts.registry;
  const iconGroups = opts.iconGroups;
  const curatedSlugs = opts.curatedSlugs || new Set();
  const rest = opts.rest;
  const fileKey = registry.fileKey;
  // Icons live in their OWN namespace (registry.icons), where no component can
  // take their slug. Reading `components` and filtering by category — which is
  // what this used to do — silently loses every icon whose name a component
  // already owns (`calendar` to Calendar, `search` to Search), because the icon
  // never makes it into that map at all. Fall back to the old filter for a
  // registry synced before the icons map existed.
  const comps =
    registry.icons ||
    Object.fromEntries(
      Object.entries(registry.components || {}).filter(
        ([, e]) => e.category === "Icons",
      ),
    );

  // Target = primary group ≠ Connector.
  const targets = Object.keys(comps).filter(
    (slug) => primaryGroup(iconGroups, slug) !== "Connector",
  );
  const skipped = Object.keys(comps).length - targets.length;

  const idToSlug = {};
  const ids = [];
  for (const slug of targets) {
    const id = comps[slug].nodeId;
    idToSlug[id] = slug;
    ids.push(id);
  }

  const cleanIcons = {};
  const degraded = [];
  // Ghosts: registry entries whose Figma node no longer exists. The registry is
  // built from the PUBLISHED-LIBRARY endpoint (/v1/files/:key/components), which
  // keeps advertising a component after its canvas node is deleted, so the
  // registry can carry entries that resolve to nothing. A ghost means THE
  // REGISTRY IS STALE, which is categorically different from "this glyph is
  // multicolor". Lumping the two together is how 28 dead icons hid in a
  // worklist while every registry diff reported "unchanged" (237 -> 237).
  const ghosts = [];

  if (ids.length > 0) {
    const resp = await rest.getImages(fileKey, ids, { format: "svg" });

    // A Figma API error must NEVER be recorded as icon loss. Without this, one
    // failed batch marks its 10 nodes "missing", the breaking gate fires on a
    // phantom regression, and a real glyph could get curated over. Fail loudly
    // instead: a transient error is an error, not a design change.
    const apiErrors = (resp && resp.errors) || [];
    if (apiErrors.length > 0) {
      throw new Error(
        "[icons] Figma /v1/images returned errors; refusing to treat this as " +
          "icon loss: " +
          apiErrors
            .map((e) => (e && e.err ? e.err : JSON.stringify(e)))
            .join("; "),
      );
    }

    const images = (resp && resp.images) || {};

    // A node with no image URL has two very different causes, and /v1/images
    // cannot tell them apart:
    //   - the node no longer exists (a GHOST: the registry is stale), or
    //   - the node exists but Figma failed to render it.
    // Only the first means the registry is lying, so ASK before claiming it.
    // We probe /v1/files/:key/nodes for exactly the un-rendered ids (a small
    // set), and Figma returns a null entry for a node that is gone.
    //
    // Without this probe the code would assert "this node no longer exists in
    // Figma" on evidence that does not support it, and a plain render failure
    // would be reported to a human as a deleted component.
    const noUrlIds = ids.filter((id) => !images[id]);
    const missingNodeIds = new Set();
    if (noUrlIds.length > 0 && typeof rest.getNodes === "function") {
      const nodesResp = await rest.getNodes(fileKey, noUrlIds);
      const nodes = (nodesResp && nodesResp.nodes) || {};
      for (const id of noUrlIds) {
        if (!nodes[id] || !nodes[id].document) missingNodeIds.add(id);
      }
    }

    for (const id of ids) {
      const slug = idToSlug[id];
      const url = images[id];
      let result;
      if (!url) {
        result = missingNodeIds.has(id)
          ? // Verified: Figma has no such node. The registry is stale.
            { ok: false, reason: "node-missing", ghost: true }
          : // The node is there; Figma just would not render it.
            { ok: false, reason: "render-failed" };
      } else {
        try {
          const buf = await rest.fetchBinary(url);
          result = normalizeIconSvg(buf.toString("utf8"));
        } catch (_e) {
          result = { ok: false, reason: "render-failed" };
        }
      }
      if (result.ok) {
        cleanIcons[slug] = { viewBox: result.viewBox, body: result.body };
      } else {
        // A curated override supplies the glyph, so this is not a degraded
        // WORKLIST item: there is nothing for a designer to redraw.
        if (!curatedSlugs.has(slug)) {
          degraded.push({ slug, reason: result.reason });
        }
        // ...but a ghost is still a ghost. The registry entry is stale whether
        // or not a hand-curated glyph happens to be masking it downstream, and
        // that staleness is what a human needs to see.
        if (result.ghost) ghosts.push(slug);
      }
    }
  }
  ghosts.sort((a, b) => a.localeCompare(b));

  // Stable, sorted output for idempotent diffs.
  const sortedIcons = {};
  for (const slug of Object.keys(cleanIcons).sort())
    sortedIcons[slug] = cleanIcons[slug];
  degraded.sort((a, b) => a.slug.localeCompare(b.slug));

  // Operational visibility: one concise line so a run is never opaque (an
  // earlier backfill exported 0 with no signal — every icon was rejected by an
  // over-strict viewBox gate). Histogram is over the degraded worklist.
  const reasonHist = {};
  for (const d of degraded)
    reasonHist[d.reason] = (reasonHist[d.reason] || 0) + 1;
  console.log(
    "[icons] exported=" +
      Object.keys(sortedIcons).length +
      " degraded=" +
      degraded.length +
      " skipped=" +
      skipped +
      (degraded.length ? " by-reason=" + JSON.stringify(reasonHist) : ""),
  );
  if (ghosts.length > 0) {
    console.warn(
      "[icons] STALE REGISTRY: " +
        ghosts.length +
        " component(s) advertised by Figma's published-library endpoint no " +
        "longer have a canvas node: " +
        ghosts.join(", "),
    );
  }

  const auto = {
    _schema_version: 1,
    _regen: {
      source: "figma",
      fileKey: fileKey,
      instructions:
        "Auto-generated by scripts/icons/export-icons-svg.js (UI icons, group != Connector). Do not hand-edit; add overrides in icons-svg.json instead.",
    },
    icons: sortedIcons,
  };

  // Only (over)write the auto file when there's at least one clean icon — an
  // empty set would violate the icons-svg schema (minProperties: 1) and, on a
  // transient all-degraded run, would clobber a prior good export. The degraded
  // worklist below is always emitted. Both writes are byte-gated: `wrote`
  // reports whether anything actually changed, so an unchanged icon library
  // no longer forces every nightly sync verdict to additive.
  var wrote = false;
  if (Object.keys(sortedIcons).length > 0) {
    wrote =
      writeIfChangedStr(
        opts.autoOutPath,
        JSON.stringify(auto, null, 2) + "\n",
      ) || wrote;
  }
  wrote =
    writeIfChangedStr(
      opts.degradedOutPath,
      JSON.stringify({ _meta: { auto_generated: true }, degraded }, null, 2) +
        "\n",
    ) || wrote;

  return {
    exported: Object.keys(sortedIcons),
    degraded,
    ghosts,
    skipped,
    wrote,
  };
}

// Byte-gated write — returns true only when the file content actually changed.
function writeIfChangedStr(p, str) {
  if (fs.existsSync(p) && fs.readFileSync(p, "utf8") === str) return false;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, str);
  return true;
}

module.exports = { run };
