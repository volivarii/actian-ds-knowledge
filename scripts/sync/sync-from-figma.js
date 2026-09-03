#!/usr/bin/env node
"use strict";

// Sprint 1 Wave 1 orchestrator. Glues figma-rest + transformers + classifier
// into a single nightly sync entry point. Called by the GitHub Action via:
//
//   node scripts/sync-from-figma.js --phase all
//
// Wave 1 scope: Phase 1 (registries: dsKit/fmKit/metaKit) + Phase 3 (text +
// effect styles, written to components/registries/meta-kit/styles.json).
//
// Phases 5 + 6 (component guidelines + foundations) stay manual — they're
// hand-curated content, not pure data. Component guidelines live in
// components/guidelines/, foundations under foundations/src/ per-section files.
//
// Exit codes:
//   0 — verdict additive or unchanged
//   1 — verdict breaking (review required)
//   2 — error (one or more phases threw)

var fs = require("fs");
var path = require("path");

var transformRegistry = require("../transformers/transform-registry.js");
var transformStyles = require("../transformers/transform-styles.js");
var classify = require("../changelog/changelog-classifier.js");
var defaultRest = require("./figma-rest.js");
var syncMediaPreview = require("./sync-media-preview.js");
var syncMediaDefault = require("./sync-media-default.js");
var syncIcons = require("../icons/export-icons-svg.js");
var deriveIconsMod = require("../icons/derive-icons-svg.js");
var syncGraphics = require("../graphics/export-graphics-svg.js");
var deriveGraphicsMod = require("../graphics/derive-graphics-svg.js");
var deriveIdentity = require("../components/derive-identity.js");
var resolvePaths = require("../../clients/resolve-paths.js");
var renamePreconditions = require("./rename-preconditions.js");
var deferredRemovals = require("./deferred-removals.js");
var { syncKnowledgeVersion } = require("../lib/sync-knowledge-version.js");

var KIT_MAP = {
  dsKit: { library: "ds", outputFile: "dskit.json" },
  fmKit: { library: "fm", outputFile: "fmkit.json" },
  metaKit: { library: "meta-kit", outputFile: "metakit.json" },
};

var REGISTRY_KITS = ["dsKit", "fmKit", "metaKit"];
var STYLES_KITS = ["dsKit"]; // Only DS Kit hosts text + effect styles
var ANATOMY_KITS = ["dsKit"]; // camelCase kit id — matches REGISTRY_KITS + opts.keys[kitId]

// ---- Helpers ----

function readJsonOrNull(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return null;
  }
}

// Canonical dist serialization — the single shape both writeJson and the
// byte-compare write gates below use, so "would this write change the file"
// is answered against the exact bytes that would land.
function serializeJson(obj) {
  // Inject _schema_version: 1 as first key if not already present (Q1 2026
  // ecosystem plan PR α: every dist artifact carries a schema version).
  var withVersion = obj;
  if (
    obj &&
    typeof obj === "object" &&
    !Array.isArray(obj) &&
    obj._schema_version === undefined
  ) {
    withVersion = Object.assign({ _schema_version: 1 }, obj);
  }
  return JSON.stringify(withVersion, null, 2) + "\n";
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, serializeJson(obj), "utf8");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Filter REST `/components` payload to standalones only (variants of sets,
// internals starting with '.', removed). Per Sprint 1 memory:
//   "containing_frame.containingComponentSet" is set on variants of a set.
function filterStandalones(componentsList) {
  return (componentsList || []).filter(function (c) {
    if (!c || typeof c.name !== "string") return false;
    if (c.name.startsWith(".")) return false;
    if (c.containing_frame && c.containing_frame.containingComponentSet)
      return false;
    return true;
  });
}

// Figma pages that hold file-local scratch/annotations, not shippable DS
// components (e.g. the "Notes/Feedback" label, a two-node text annotation).
// Components resolved onto these pages are dropped from the registry, which
// also keeps them out of the derived categories.json (built from the same
// object) instead of surfacing as an orphan "Local components" category.
var DENIED_PAGES = ["Local components"];

// One predicate for "is this page denied", shared by the exclusion below and by
// suppressDeniedPageCollisions, so the two can never disagree about what the
// list means.
//
// Matches the name exactly, or as a leading whole word. Exact match alone is why
// this list silently stopped applying: the page grew from "Local components" to
// "Local components + templates", `includes` stopped matching, and Notes/Feedback
// published into the registry under a "Local components + templates" category of
// its own. A denied page that gains a suffix is still the denied page. The word
// boundary is required (`d + " "`), so "Local components" does not deny a page
// that merely starts with those characters.
function isDeniedPage(pageName, deniedPages) {
  if (pageName == null) return false;
  var page = String(pageName).trim();
  return (deniedPages || []).some(function (denied) {
    var d = String(denied).trim();
    return d.length > 0 && (page === d || page.indexOf(d + " ") === 0);
  });
}

// Remove components whose resolved Figma `page` is denied. Operates on
// a transformed registry ({ components: { slug: { page, ... } } }) and returns a
// new object; the input is not mutated. Unknown/missing pages are kept.
function excludeDeniedPages(registry, deniedPages) {
  if (!registry || !registry.components) return registry;
  var denied = deniedPages || [];
  var kept = {};
  Object.keys(registry.components).forEach(function (slug) {
    var entry = registry.components[slug];
    if (entry && isDeniedPage(entry.page, denied)) return;
    kept[slug] = entry;
  });
  var out = Object.assign({}, registry, { components: kept });
  // transformRegistry sets componentCount on the full set BEFORE this drop, so
  // recompute it here or a scratch-page removal leaves the count stale (the
  // v0.34.54 dskit.json regression: notes-feedback dropped, count stuck at 318).
  // Only when the input already carried a count — never invent one.
  if (typeof registry.componentCount === "number") {
    out.componentCount = Object.keys(kept).length;
  }
  return out;
}

// A slug collision on a denied scratch page is NOT a lost component: those pages
// are dropped wholesale by excludeDeniedPages, so the node was never going to
// publish, and alarming about it would be a FALSE ALARM — worse than no alarm,
// because it trains the reader to skim past the section that exists to catch a
// real loss. transformRegistry cannot know DENIED_PAGES (a sync-level concept),
// so it reports every collision honestly and the suppression happens here,
// against the page the warning carries. Pure + exported so it is testable
// without a Figma round-trip.
function suppressDeniedPageCollisions(warnings, deniedPages) {
  var denied = deniedPages || [];
  return (warnings || []).filter(function (w) {
    if (!w || w.code !== "SLUG_COLLISION_DROPPED") return true;
    // `namespaced` = an icon and a component share a name, and the icons namespace
    // has already resolved it: the icon is in registry.icons, the component in
    // registry.components, and NOTHING is lost. That is the system working, not an
    // anomaly, and it would otherwise fire on `calendar` and `search` every single
    // night forever. An alarm that shouts about a non-problem is how the section
    // that catches a REAL loss gets scrolled past.
    if (w.severity === "namespaced") return false;
    return !(
      isDeniedPage(w.droppedPage, denied) ||
      isDeniedPage(w.droppedPageRaw, denied)
    );
  });
}

var CATEGORY_MASS_LOSS_FLOOR = 10;

// Stable identity for a registry component, most-durable-first. `key` is the
// rename-proof Figma component key (#368); `nodeId` also survives a page move;
// the registry slug is the last resort. This is what lets a genuine removal be
// told apart from a component that merely moved pages during a Figma reorg.
// Every real DS Kit component carries a unique `key` and `nodeId`, so the slug
// fallback only serves synthetic/test fixtures; if keyless+nodeId-less
// components ever ship, the slug fallback could collide across before/after.
function identityOf(slug, comp) {
  return (comp && (comp.key || comp.nodeId)) || slug;
}

// Count registry components per non-empty category.
function categoryCounts(registry) {
  var counts = {};
  var comps = (registry && registry.components) || {};
  Object.keys(comps).forEach(function (slug) {
    var cat = comps[slug] && comps[slug].category;
    if (!cat) return;
    counts[cat] = (counts[cat] || 0) + 1;
  });
  return counts;
}

// Carry a component's last-known-good category forward when THIS sync failed to
// attribute a valid one. Category is inferred from the Figma Pages panel (a
// Title-Case header page sets the category for the members beneath it), so
// during a reorg a still-published component can come back with its category
// dropped to null or re-derived to a non-category (its own page name). Rather
// than let it ship uncategorized (falling out of categories.json, the docs page
// tree, and the graph) or red the whole sync, restore the category recorded for
// the same component (matched by stable identity) in the previous dist.
//
// A well-formed category (truthy AND present in the previous dist's category
// universe) is TRUSTED, so a deliberate move to another established category
// flows straight through; only null / unknown buckets are restored. Pure apart
// from mutating `after`'s components; returns the drift list for reporting.
// Self-retiring: a stable file matches last-known-good, so nothing is restored
// and the drift list comes back empty.
var KNOWN_CATEGORY_SET =
  require("../transformers/transform-categories.js").KNOWN_CATEGORIES.reduce(
    function (acc, name) {
      acc[name] = true;
      return acc;
    },
    Object.create(null),
  );

function preserveKnownCategories(before, after) {
  var beforeComps = (before && before.components) || {};
  var afterComps = (after && after.components) || {};
  var established = {};
  var byIdentity = {};
  Object.keys(beforeComps).forEach(function (slug) {
    var c = beforeComps[slug];
    if (c && c.category) established[c.category] = true;
    byIdentity[identityOf(slug, c)] = c;
  });
  var drift = [];
  Object.keys(afterComps).forEach(function (slug) {
    var c = afterComps[slug];
    if (!c) return;
    // Well-formed means EITHER already in the previous dist's universe, OR a
    // declared member of the taxonomy. Without the second clause this is a
    // ratchet: `established` is built from the previous dist, so a category
    // Figma RENAMES can never establish itself and is reverted every night,
    // forever. That is what pinned the nine Form pages to a last-known value
    // carrying a page name as the category and a stale section (#428).
    // A page name is still reverted, because it is in neither set.
    if (
      c.category &&
      (established[c.category] || KNOWN_CATEGORY_SET[c.category])
    ) {
      return;
    }
    // Identity first, then the SLUG as a fallback. A component Figma re-keys
    // (a dissolved component set, a master replaced in place) keeps its slug and
    // its name but gets a new key, so identityOf finds no twin and the restore
    // silently does not fire -- which is how `illustration` shipped attributed
    // to a page called "Playground" with no section at all on 2026-09-03. The
    // sync's own diff already calls a re-key "same slug and name under a new
    // Figma node"; this is that fact, used.
    //
    // The name gate is what makes the fallback safe. A slug can CHANGE OCCUPANT
    // (2026-09-03: `calendar` went from an icon to the date field), and without
    // it the new occupant would inherit the old one's page attribution. Same
    // slug AND same name is the same component; same slug alone is not.
    var twin = byIdentity[identityOf(slug, c)];
    if (!twin) {
      var bySlug = beforeComps[slug];
      if (bySlug && bySlug.name && c.name && bySlug.name === c.name)
        twin = bySlug;
    }
    if (!twin || !twin.category) return; // genuinely new / never categorized
    drift.push({
      slug: slug,
      name: c.name || null,
      from: twin.category,
      observed: c.category || null,
      page: c.page || null,
    });
    // Reconcile the WHOLE page-attribution block to last-known-good, not just
    // `category`. `section` and `group` are derived from the same page position
    // and ship in registry.json (the docs page tree groups on
    // `section`/`group`), so restoring `category` alone would leave an
    // internally inconsistent entry that no schema gate catches. `page` is the
    // component's own factual page and is left intact.
    //
    // `status` is deliberately NOT in this list. It used to be page-derived,
    // which is why it belonged here; since the DS Kit v2.7.0 reorg it is
    // authored on the COMPONENT NAME, so it does not move when page
    // attribution drifts. Restoring it from the previous dist would resurrect
    // a value Figma no longer asserts, and the component's own emoji (or its
    // absence) is the answer either way.
    ["section", "category", "categorySlug", "group"].forEach(function (f) {
      if (twin[f] != null) c[f] = twin[f];
      else delete c[f];
    });
  });
  return drift;
}

// Refuse to emit a registry that genuinely LOST components. A category counts
// as a mass loss only when >= FLOOR of its previous members are ABSENT by
// stable identity (removed from Figma), NOT when the category merely emptied
// because a page rename re-bucketed present components elsewhere; that is a
// reshuffle, which preserveKnownCategories above already repaired. A thrown
// error inside a runWithGuard-wrapped phase makes the sync verdict "error"
// (exit 2, no PR). Intentional removals are acknowledged via opts.allow.
function assertNoCategoryMassLoss(before, after, opts) {
  opts = opts || {};
  var allow = opts.allow || [];
  var beforeComps = (before && before.components) || {};
  var afterComps = (after && after.components) || {};
  var presentIds = {};
  Object.keys(afterComps).forEach(function (slug) {
    presentIds[identityOf(slug, afterComps[slug])] = true;
  });
  var beforeByCat = {};
  var absentByCat = {};
  Object.keys(beforeComps).forEach(function (slug) {
    var c = beforeComps[slug];
    var cat = c && c.category;
    if (!cat) return;
    beforeByCat[cat] = (beforeByCat[cat] || 0) + 1;
    if (!presentIds[identityOf(slug, c)]) {
      absentByCat[cat] = (absentByCat[cat] || 0) + 1;
    }
  });
  var lost = Object.keys(absentByCat).filter(function (cat) {
    return (
      absentByCat[cat] >= CATEGORY_MASS_LOSS_FLOOR && allow.indexOf(cat) < 0
    );
  });
  if (lost.length) {
    throw new Error(
      "[sync] category mass-loss: " +
        lost
          .map(function (c) {
            return (
              c + " (" + absentByCat[c] + " of " + beforeByCat[c] + " removed)"
            );
          })
          .join(", ") +
        ". These components are ABSENT from the new sync (removed from Figma), not " +
        "merely re-bucketed. If intentional, acknowledge via SYNC_ALLOW_CATEGORY_LOSS. " +
        "Refusing to emit a registry that lost components.",
    );
  }
}

// Emoji blocks that can plausibly prefix a Figma layer name: Misc Symbols +
// Dingbats (✅ ✍ ⚠ ⛔ ⚪) and the pictograph planes (🟢 …), plus the
// variation selector that trails most of them. Deliberately excludes arrows
// and math symbols, which are punctuation a real component name may want.
var NAME_EMOJI_RE = /[\u{2600}-\u{27BF}\u{1F000}-\u{1FAFF}\u{FE0F}]/u;

// Refuse to emit a registry whose `name` still carries an emoji.
//
// Status is authored as a leading emoji on the component name and stripped by
// transform-registry, so anything left over is an emoji we do NOT understand.
// It is not decoration: `name` is the display name the docs site and the
// plugin render, and "✍️ Badge" shipped to both for weeks before anyone
// looked. The DS Kit already contains 🟢 as a `Dev status` variant value, so
// the next vocabulary someone invents lands here first.
//
// Throwing makes the sync verdict "error" (exit 2, no PR), same as the
// category mass-loss guard. The fix is a rename in Figma, or adding the emoji
// to COMPONENT_STATUS_MAP if it is meant to be a status.
function assertNoEmojiInNames(registry) {
  var offenders = [];
  var inspected = 0;
  var present = 0;
  ["components", "icons"].forEach(function (ns) {
    var bucket = (registry && registry[ns]) || {};
    Object.keys(bucket).forEach(function (slug) {
      var entry = bucket[slug];
      present++;
      if (!entry || typeof entry.name !== "string") return;
      inspected++;
      if (NAME_EMOJI_RE.test(entry.name)) {
        offenders.push(ns + ":" + slug + " (" + entry.name + ")");
      }
    });
  });
  // THE FALSE ALL-CLEAR: entries are present but none exposed a `name`, so the
  // gate would report clean having checked nothing. An empty kit is a
  // different thing (fmKit/metaKit can legitimately carry no components) and
  // is not a failure — there is genuinely nothing to check.
  if (present > 0 && inspected === 0) {
    throw new Error(
      "[sync] emoji-in-name gate inspected no names, yet " +
        present +
        " entr" +
        (present === 1 ? "y is" : "ies are") +
        " present. Refusing to report clean on a check that ran on nothing.",
    );
  }
  if (offenders.length) {
    throw new Error(
      "[sync] emoji left in component name(s): " +
        offenders.join(", ") +
        ". `name` is the display name shipped to the docs site and the plugin. " +
        "Rename the component in Figma, or if this emoji is meant to mark " +
        "status, add it to COMPONENT_STATUS_MAP in " +
        "scripts/transformers/component-status-emoji.js. Refusing to emit.",
    );
  }
}

// Fetch /nodes for many ids via the wrapper's batched getNodes. Returns a
// map of nodeId → node payload. Internal batching keeps Figma's rate limit
// happy — a single sync that needs 300+ nodes lands in ~6 batched calls
// instead of 300 individual ones, well under any per-second limit.
function fetchNodesMap(rest, fileKey, ids) {
  var unique = [];
  var seen = {};
  for (var i = 0; i < ids.length; i++) {
    if (!ids[i] || seen[ids[i]]) continue;
    seen[ids[i]] = true;
    unique.push(ids[i]);
  }
  if (unique.length === 0) return Promise.resolve({});
  return rest.getNodes(fileKey, unique).then(function (resp) {
    return (resp && resp.nodes) || {};
  });
}

// ---- Per-phase syncs ----

// ζ.5: load the curated icon-groups.json mapping. Layered onto icon
// registry entries (category === "Icons") to replace the uniform
// "Actual icons" group with semantic labels. Returns the raw object
// (group label → slug[]); transformer inverts it. Returns null when
// the file is missing — sync continues with the legacy `group: "Actual
// icons"` for icons, no regression.
function loadIconGroups(iconGroupsPath) {
  if (!iconGroupsPath) return null;
  return readJsonOrNull(iconGroupsPath);
}

// Load the page-level category override config (components/src/
// category-page-overrides.json). Returns { overrides, exclude } or null.
function loadPageOverrides(pluginDir) {
  return readJsonOrNull(
    path.join(pluginDir, "components", "src", "category-page-overrides.json"),
  );
}

// Authored deferrals for registry removals. Absent file means none, which is the
// correct default: a missing file must never read as "defer everything".
function loadDeferrals(pluginDir) {
  var file = path.join(pluginDir, "components", "src", "sync-deferrals.json");
  if (!fs.existsSync(file)) return [];
  var doc = readJsonOrNull(file);
  // 🪤 A present-but-malformed file must NOT read as "defer nothing". That is
  // the false all-clear shape: somebody authored a deferral, mistyped the key,
  // and the night breaks with the file sitting there looking correct.
  if (!doc || !Array.isArray(doc.deferrals)) {
    throw new Error(
      file +
        " exists but has no `deferrals` array. Fix the file, or delete it if " +
        "nothing is deferred. Refusing to read a malformed override as 'none'.",
    );
  }
  return doc.deferrals;
}

// Split in two on purpose (#552). The verdict on a slug RENAME depends on
// whether the old slug will still resolve, which is a fact about the ledger this
// run is about to write, not about the ledger already committed. So every kit's
// `after` registry is computed first, the ledger is rebuilt from those, and only
// then is anything classified. Doing it the other way round deadlocks: the
// ledger is derived in a later step, and a breaking verdict opens no PR, so the
// regenerated ledger is discarded and the same rename is re-detected forever.
async function computeRegistry(opts, kitId) {
  var meta = KIT_MAP[kitId];
  var fileKey = opts.keys[kitId];
  if (!fileKey)
    throw new Error(
      "Missing file key for kit '" + kitId + "' in figma keys file",
    );
  var outputPath = path.join(opts.outputDir, meta.outputFile);

  var beforeFile = readJsonOrNull(outputPath);
  var before = beforeFile || {
    library: meta.library,
    fileKey: fileKey,
    components: {},
  };

  // Fetch lightweight metadata
  var csResp = await opts.rest.getComponentSets(fileKey);
  var cResp = await opts.rest.getComponents(fileKey);
  var componentSets =
    (csResp && csResp.meta && csResp.meta.component_sets) || [];
  var componentsList = (cResp && cResp.meta && cResp.meta.components) || [];
  var standalones = filterStandalones(componentsList);

  // Fetch node payloads (componentPropertyDefinitions) in parallel
  var setIds = componentSets.map(function (s) {
    return s.node_id;
  });
  var standaloneIds = standalones.map(function (s) {
    return s.node_id;
  });
  var [componentSetNodes, standaloneNodes] = await Promise.all([
    fetchNodesMap(opts.rest, fileKey, setIds),
    fetchNodesMap(opts.rest, fileKey, standaloneIds),
  ]);

  // For dsKit only, also fetch the document tree to capture page-section
  // category grouping. The team encodes categories via a page-naming
  // convention (see components/AUTHORING.md). FM Kit (single page) and
  // Meta Kit (already tool-grouped) don't have a category structure.
  var documentChildren = null;
  if (kitId === "dsKit") {
    var fileResp = await opts.rest.getFile(fileKey, { depth: 1 });
    documentChildren =
      (fileResp && fileResp.document && fileResp.document.children) || [];
  }

  var categoryWarnings = [];

  var after = transformRegistry({
    library: meta.library,
    fileKey: fileKey,
    componentSets: componentSets,
    componentSetNodes: componentSetNodes,
    standalones: standalones,
    standaloneNodes: standaloneNodes,
    documentChildren: documentChildren,
    iconGroups: opts.iconGroups || null,
    pageOverrides: opts.pageOverrides || null,
    onWarnings: function (ws) {
      // transformRegistry can call onWarnings twice (category inference,
      // then component-on-category-page detection) — concat, don't clobber.
      categoryWarnings = categoryWarnings.concat(ws || []);
    },
  });

  categoryWarnings = suppressDeniedPageCollisions(
    categoryWarnings,
    DENIED_PAGES,
  );

  // Slug collisions drop a PUBLISHED component on the floor. Say it in the run
  // log too, not only in the PR body — a sync that is dispatched by hand (or
  // read in the Actions log) must not have to open a PR to learn it lost a
  // component.
  categoryWarnings
    .filter(function (w) {
      return w.code === "SLUG_COLLISION_DROPPED";
    })
    .forEach(function (w) {
      console.warn(
        "[sync] SLUG COLLISION (" +
          (w.severity === "duplicate" ? "duplicate master" : "LOST COMPONENT") +
          ") on '" +
          w.slug +
          "': DROPPED '" +
          w.droppedName +
          "' (" +
          w.droppedNodeId +
          ") — slug already held by '" +
          w.keptName +
          "' (" +
          w.keptNodeId +
          "). " +
          (w.severity === "duplicate"
            ? "Same component published twice; the slug still resolves, nothing is missing."
            : "A DIFFERENT component owns the slug, so this one is absent from the design system."),
      );
    });

  // Drop file-local scratch pages (e.g. "Local components") before classify +
  // write, so they leak into neither the registry nor the derived
  // categories.json. dsKit-only: the page-naming convention (and these scratch
  // pages) is a DS Kit concept; FM Kit / Meta Kit have no page categories.
  // The exclusion is silent by design, so log what it removed: a non-empty
  // drop confirms the filter ran; an empty drop means a denied page matched
  // nothing, which usually signals a Figma page rename that would otherwise
  // silently re-leak the scratch nodes (cf. the icon-rename sync failure).
  if (kitId === "dsKit") {
    var preKeys = Object.keys(after.components || {});
    after = excludeDeniedPages(after, DENIED_PAGES);
    var dropped = preKeys.filter(function (slug) {
      return !(after.components && slug in after.components);
    });
    if (dropped.length) {
      console.warn(
        "[sync] excluded scratch-page component(s): " + dropped.join(", "),
      );
    } else {
      console.warn(
        "[sync] DENIED_PAGES " +
          JSON.stringify(DENIED_PAGES) +
          " matched no components (possible Figma page rename).",
      );
    }
  }

  // Deferred removals are applied HERE, not at classify time, and the placement
  // is load-bearing. Everything downstream of this point reasons about `after`
  // as the set the run is publishing: the category mass-loss tripwire (which
  // THROWS, so a deferred family decomposition would otherwise make the whole
  // night `error`, strictly worse than the breaking night this replaces), the
  // category preservation below, and the identity ledger, which is built and
  // written from these registries before any verdict is taken. Applying it later
  // dropped the deferred component from the ledger and erased its accumulated
  // `previousSlugs` — the one field that is not derivable from current state,
  // and the field clients/resolve-paths.js reads to resolve a renamed-away slug.
  var deferralState = deferredRemovals.resolve({
    deferrals: (opts && opts.deferrals) || [],
    kitId: kitId,
    knownKits: Object.keys(KIT_MAP),
    before: before,
    after: after,
    now: (opts && opts.syncedAt) || new Date().toISOString(),
  });
  after = deferredRemovals.reinstate(before, after, deferralState.apply);

  var categoryDrift = [];
  if (kitId === "dsKit") {
    // Carry a survivor's last-known category forward when a Figma page rename
    // dropped or garbled its attribution, BEFORE the mass-loss tripwire runs, so
    // a reshuffling file keeps shipping instead of reding the nightly. Then drop
    // the now-stale "resolved to NO category" warnings for the ones we repaired,
    // so the run report names only components that are STILL uncategorized.
    categoryDrift = preserveKnownCategories(before, after);
    if (categoryDrift.length) {
      var restored = {};
      categoryDrift.forEach(function (d) {
        restored[d.slug] = true;
      });
      categoryWarnings = categoryWarnings.filter(function (w) {
        return !(
          w.code === "COMPONENT_WITHOUT_CATEGORY" && restored[w.component]
        );
      });
      console.warn(
        "[sync] CATEGORY DRIFT: " +
          categoryDrift.length +
          " component(s) kept their last-known category because Figma page " +
          "attribution changed. Review components/src/category-page-overrides.json " +
          "or accept the new structure.",
      );
      categoryDrift.forEach(function (d) {
        console.warn(
          "  - " +
            d.slug +
            " -> " +
            d.from +
            " (Figma now reports " +
            (d.observed == null ? "no category" : "'" + d.observed + "'") +
            (d.page ? ", page '" + d.page + "'" : "") +
            ")",
        );
      });
    }

    // Report components STILL uncategorized after preservation (genuinely new,
    // no last-known category to restore). Emitted here, post-preserve, so a
    // rescued component never prints the scary "falls out" line above its
    // rescue line.
    categoryWarnings
      .filter(function (w) {
        return w.code === "COMPONENT_WITHOUT_CATEGORY";
      })
      .forEach(function (w) {
        console.warn(
          "[sync] NO CATEGORY: '" +
            w.component +
            "' (" +
            w.name +
            ") on published page '" +
            w.page +
            "' matches no category. It falls out of categories.json, the docs page tree " +
            "and the graph. Usual cause: the page was renamed on the canvas without " +
            "republishing the library.",
        );
      });

    var allowedLoss = (process.env.SYNC_ALLOW_CATEGORY_LOSS || "")
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    assertNoCategoryMassLoss(before, after, { allow: allowedLoss });
  }

  // Every kit, not just dsKit: `name` ships as the display name from all three
  // registries, so an emoji left in one is equally wrong wherever it came from.
  assertNoEmojiInNames(after);

  // Meta Kit: preserve hand-curated `templates` section across resync (Task 2.3).
  if (kitId === "metaKit" && beforeFile && beforeFile.templates) {
    after.templates = beforeFile.templates;
  }
  // Phase B: preserve `_meta` block on metakit.json across resync. The block
  // documents the `templates` hybrid hand-curation surface so consumers can
  // detect it programmatically (`_meta.hybrid: true`, `_meta.hybrid_field`).
  if (kitId === "metaKit" && beforeFile && beforeFile._meta) {
    after._meta = beforeFile._meta;
  }

  return {
    kitId: kitId,
    meta: meta,
    opts: opts,
    deferralState: deferralState,
    before: before,
    beforeFile: beforeFile,
    after: after,
    outputPath: outputPath,
    documentChildren: documentChildren,
    categoryWarnings: categoryWarnings,
    categoryDrift: categoryDrift,
  };
}

// Classify and write, given the rename index derived from the ledger this run
// just rebuilt. `absorbedRenames` is `{fromSlug: toSlug}`; a rename it records
// with the matching target is not breaking, because the old slug still resolves.
function finishRegistry(computed, absorbedRenames) {
  var kitId = computed.kitId;
  var meta = computed.meta;
  var opts = computed.opts;
  var before = computed.before;
  var beforeFile = computed.beforeFile;
  var after = computed.after;
  var outputPath = computed.outputPath;
  var documentChildren = computed.documentChildren;
  var categoryWarnings = computed.categoryWarnings;
  var categoryDrift = computed.categoryDrift;

  // Reporting only. The deferrals were APPLIED in computeRegistry, before the
  // mass-loss tripwire and before the ledger was built from these registries;
  // re-resolving here would find nothing, because `after` already carries the
  // reinstated entries. See the comment at the application site.
  var deferralState = computed.deferralState || {
    apply: [],
    expired: [],
    errors: [],
  };
  deferralState.errors.forEach(function (e) {
    console.warn("[sync] deferral rejected: " + e);
  });
  deferralState.expired.forEach(function (e) {
    console.warn(
      "[sync] deferral for '" +
        e.slug +
        "' EXPIRED on " +
        e.deferral.review_by +
        " (" +
        e.daysPast +
        " days ago). Removals are no longer deferred. Extend it with a fresh " +
        "reason, or carry the removal through.",
    );
  });

  // Fold declarations come from the identity ledger, which is where a retired
  // slug's destination is already recorded, rather than from a second
  // hand-maintained list saying the same thing in another file.
  // `buildRenameIndex` is reused rather than restated: it already drops a slug
  // that is current for some component and refuses an ambiguous one claimed by
  // two identities.
  //
  // Scope, precisely: the CLASSIFIER never absorbs a fold, so passing
  // `foldedInto` cannot turn a breaking night additive. It does not follow that
  // declaring a fold is cosmetic. `previousSlugs` is a shared ledger, and its
  // other readers act on the same entry: it is what makes the retired slug
  // resolve for consumers (the point), and a 1:1 fold whose authored references
  // have since been cleaned also becomes absorbable by the rename machinery.
  // A fold declaration is a statement about where a component went, not a label
  // on a report.
  var verdict = classify({
    fileKind: "registry",
    before: before,
    after: after,
    absorbedRenames: absorbedRenames,
    foldedInto: computed.foldedInto || null,
  });

  // 🪤 A REJECTED deferral must reach a human, and on a quiet night nothing else
  // would carry it. Dead config produces no removal, so the verdict can be
  // `unchanged`: no PR, no rolling tracker, and release-notes/ is gitignored, so
  // the reason is discarded with the runner. That is a warning inside a green
  // run, which this feature's own rationale cites plugin #294 to reject. An
  // expired deferral needs no help here, because the removal it stopped
  // deferring is itself breaking.
  if (deferralState.errors.length > 0) {
    verdict = {
      category: "breaking",
      changelog: verdict.changelog,
      reasons: (verdict.reasons || []).concat(
        deferralState.errors.map(function (e) {
          return "rejected deferral: " + e;
        }),
      ),
    };
  }
  // Canonical write gate. When the entries are unchanged, carry the previous
  // lastSynced forward so the timestamp never churns on a re-emit; then write
  // ONLY when the canonical bytes differ from what is on disk. Three cases:
  // unchanged + identical bytes → skip; unchanged + byte drift (the one-time
  // key-order canonicalization migration) → write, timestamp preserved;
  // entry changes → write with the fresh timestamp.
  var wrote = false;
  if (verdict.category === "unchanged" && beforeFile && beforeFile.lastSynced) {
    after.lastSynced = beforeFile.lastSynced;
  }
  if (
    !fs.existsSync(outputPath) ||
    fs.readFileSync(outputPath, "utf8") !== serializeJson(after)
  ) {
    writeJson(outputPath, after);
    wrote = true;
  }

  // Emit components/dist/categories.json alongside the registry for dsKit
  // only. Content-compared: the artifact's generatedAt is preserved from the
  // previous file when everything else is equal (generatedAt then means
  // "last content change", and a no-op night stops rewriting the file).
  if (kitId === "dsKit" && documentChildren) {
    var categoriesTransformer = require("../transformers/transform-categories.js");
    var artifact = categoriesTransformer.buildCategoriesArtifact(after);
    // Prefer explicit --categories-path; fall back to legacy
    // path.dirname(outputDir) for backwards compat with any callers that
    // omit the flag.
    var categoriesPath =
      opts.categoriesPath ||
      path.join(path.dirname(opts.outputDir), "categories.json");
    var prevCategories = readJsonOrNull(categoriesPath);
    var categoriesContent = function (o) {
      return JSON.stringify({
        library: o.library,
        categories: o.categories,
        uncategorized: o.uncategorized,
      });
    };
    if (
      prevCategories &&
      prevCategories.generatedAt &&
      categoriesContent(prevCategories) === categoriesContent(artifact)
    ) {
      artifact.generatedAt = prevCategories.generatedAt;
    }
    if (
      !fs.existsSync(categoriesPath) ||
      fs.readFileSync(categoriesPath, "utf8") !== serializeJson(artifact)
    ) {
      writeJson(categoriesPath, artifact);
      wrote = true;
    }
  }

  return {
    kitId: kitId,
    fileLabel: meta.outputFile,
    verdict: verdict,
    wrote: wrote,
    deferrals: deferralState,
    categoryWarnings: categoryWarnings,
    categoryDrift: categoryDrift,
  };
}

async function syncStyles(opts, kitId) {
  var fileKey = opts.keys[kitId];
  if (!fileKey)
    throw new Error(
      "Missing file key for kit '" + kitId + "' in figma keys file",
    );
  var outputPath = path.join(opts.outputDir, "meta-kit", "styles.json");

  var before = readJsonOrNull(outputPath) || {
    textStyles: [],
    effectStyles: [],
  };

  var stylesPayload = await opts.rest.getStyles(fileKey);
  var styleEntries =
    (stylesPayload && stylesPayload.meta && stylesPayload.meta.styles) || [];
  var styleIds = styleEntries.map(function (s) {
    return s.node_id;
  });
  var nodes = await fetchNodesMap(opts.rest, fileKey, styleIds);

  var after = transformStyles({ stylesPayload: stylesPayload, nodes: nodes });
  var verdict = classify({ fileKind: "styles", before: before, after: after });
  var wrote = false;
  if (verdict.category !== "unchanged" || !fs.existsSync(outputPath)) {
    writeJson(outputPath, after);
    wrote = true;
  }
  return {
    kitId: kitId,
    fileLabel: "meta-kit/styles.json",
    verdict: verdict,
    wrote: wrote,
  };
}

// ---- Verdict aggregation ----

function aggregateVerdict(results, errors) {
  if (errors.length > 0) return "error";
  var anyBreaking = results.some(function (r) {
    return r.verdict.category === "breaking";
  });
  if (anyBreaking) return "breaking";
  var anyAdditive = results.some(function (r) {
    return r.verdict.category === "additive";
  });
  if (anyAdditive) return "additive";
  return "unchanged";
}

function exitCodeFor(category) {
  if (category === "breaking") return 1;
  if (category === "error") return 2;
  return 0;
}

// An expired or revoked Figma credential fails EVERY phase at the first request,
// which the verdict reports as a bare `error` — indistinguishable from a dangling
// curated override or a renamed component. On 2026-07-30 the PAT expired and the
// nightly stayed red for 11 nights while the tracking issue advised checking for
// a dangling icon slug, which is the wrong first move and costs a reader the run
// log to find out. Classifying it means the remedy can name itself.
//
// Matched on the API's own words: Figma answers an expired token with 401
// "Token has expired" on the REST endpoints and 403 "Token expired" on the
// image/nodes endpoints, and an invalid one with 403 "Invalid token".
var FIGMA_AUTH_ERROR_RE =
  /\b(?:401|403)\b[\s\S]*?(?:token (?:has )?expired|invalid token|not authorized|unauthorized)/i;

function isAuthError(err) {
  return FIGMA_AUTH_ERROR_RE.test(String((err && err.message) || err || ""));
}

// "auth" only when EVERY error is a credential rejection. A mixed run (one phase
// 401s, another hits a dangling override) stays "content", because the content
// error is the one that needs a human reading the log: an auth-only diagnosis
// would send them to rotate a token and declare victory while a real defect
// stayed hidden.
function failureKind(errors) {
  if (!errors || errors.length === 0) return "none";
  return errors.every(function (e) {
    return isAuthError(e && e.error);
  })
    ? "auth"
    : "content";
}

// ---- Changelog assembly ----

function escapeBackticks(s) {
  // Escape embedded backticks so inline code spans don't corrupt markdown
  // when category names or page names contain them.
  return String(s).replace(/`/g, "'");
}

function buildChangelog(date, category, results, errors) {
  var lines = [];
  lines.push("# Sync " + date + " — " + category);
  lines.push("");
  lines.push(
    "Auto-generated by `scripts/sync-from-figma.js` at " +
      new Date().toISOString() +
      ".",
  );
  lines.push("");
  results.forEach(function (r) {
    lines.push("## " + r.fileLabel + " — " + r.verdict.category);
    lines.push("");
    lines.push(r.verdict.changelog || "_(empty)_");
    lines.push("");

    // Deferred removals are RECORDED, never merely suppressed. A reader of this
    // file must be able to see that the registry is carrying something Figma has
    // retired, why, where the conversation lives, and when it stops.
    var def = r.deferrals;
    if (def && (def.apply.length || def.expired.length || def.errors.length)) {
      lines.push("### Deferred removals");
      lines.push("");
      def.apply.forEach(function (a) {
        lines.push(
          "- ⏸️ `" +
            escapeBackticks(a.slug) +
            "` kept, removal deferred until **" +
            a.deferral.review_by +
            "** (#" +
            a.deferral.issue +
            "): " +
            a.deferral.reason,
        );
      });
      def.expired.forEach(function (e) {
        lines.push(
          "- ⛔ `" +
            escapeBackticks(e.slug) +
            "` deferral EXPIRED on " +
            e.deferral.review_by +
            " (" +
            e.daysPast +
            " days ago), so the removal is back and this sync is breaking. " +
            "Extend it with a fresh reason, or carry the removal through (#" +
            e.deferral.issue +
            ").",
        );
      });
      def.errors.forEach(function (msg) {
        lines.push("- 🚨 " + msg);
      });
      lines.push("");
    }
    // Slug collisions get their own heading, ABOVE the warn-only drift block:
    // this is not drift, it is a component that Figma publishes and the registry
    // silently does not. Nothing downstream can see the loss (the cross-registry
    // detector reads the already-deduped map), so this section is the only place
    // it is ever named.
    // Two severities, two sections. Rendering them alike is how a real alarm
    // becomes wallpaper: the first real run found ten collisions, of which only
    // TWO were losses. Burying those two under eight benign duplicates would
    // train the reader to scroll past the section that exists to catch the two.
    var allCollisions = (r.categoryWarnings || []).filter(function (w) {
      return w.code === "SLUG_COLLISION_DROPPED";
    });
    function renderCollision(w) {
      lines.push(
        "- `" +
          escapeBackticks(w.slug) +
          "` — dropped **" +
          escapeBackticks(w.droppedName) +
          "** (`" +
          escapeBackticks(w.droppedNodeId) +
          "`" +
          (w.droppedPageRaw
            ? " on page `" + escapeBackticks(w.droppedPageRaw) + "`"
            : "") +
          "), kept **" +
          escapeBackticks(w.keptName || "?") +
          "** (`" +
          escapeBackticks(w.keptNodeId || "?") +
          "`)",
      );
    }

    var losses = allCollisions.filter(function (w) {
      return w.severity !== "duplicate";
    });
    if (losses.length > 0) {
      lines.push(
        "### 🚨 Slug collision — " +
          losses.length +
          " component(s) LOST from the design system",
      );
      lines.push("");
      lines.push(
        "Two **different** components want one slug, and `registry.components` is keyed by " +
          "slug — so the loser is not renamed, it **disappears**. It is published in Figma " +
          "and absent from the design system. Rename one of the two nodes to publish both.",
      );
      lines.push("");
      losses.forEach(renderCollision);
      lines.push("");
    }

    var dupes = allCollisions.filter(function (w) {
      return w.severity === "duplicate";
    });
    if (dupes.length > 0) {
      lines.push(
        "### ⚠️ Duplicate master — " +
          dupes.length +
          " slug(s) published from two nodes (nothing lost)",
      );
      lines.push("");
      lines.push(
        "The same component is published twice under one slug, so the slug still resolves " +
          "to the surviving node and **nothing is missing from the design system**. Figma " +
          "hygiene, not data loss: expected while the icon masters live on two pages during " +
          "the refactor. Delete the stale duplicate to clear these.",
      );
      lines.push("");
      dupes.forEach(renderCollision);
      lines.push("");
    }
    var drift = (r.categoryWarnings || []).filter(function (w) {
      return (
        w.code !== "SLUG_COLLISION_DROPPED" &&
        w.code !== "COMPONENT_WITHOUT_CATEGORY"
      );
    });

    // A component with no category falls out of categories.json, the docs page
    // tree, and the graph's in_category edges — silently. Its own section, because
    // "drift" undersells it: the component is effectively unpublished downstream.
    var uncategorized = (r.categoryWarnings || []).filter(function (w) {
      return w.code === "COMPONENT_WITHOUT_CATEGORY";
    });
    if (uncategorized.length > 0) {
      lines.push(
        "### 🚨 " +
          uncategorized.length +
          " component(s) resolved to NO category",
      );
      lines.push("");
      lines.push(
        "These are in the registry but belong to no category, so they fall out of " +
          "`categories.json`, the docs site's page tree, and the graph's `in_category` " +
          "edges. The docs site will not generate a page for them at all.",
      );
      lines.push("");
      lines.push(
        "**Most likely cause:** the component's Figma page was renamed or moved on the " +
          "canvas, but the library was **not republished**. Category inference reads the " +
          "LIVE document tree, while each component's page name comes from PUBLISHED " +
          "metadata — rename without republish and the two stop matching, silently. " +
          "Republish the library, or add the page to `components/src/category-page-overrides.json`.",
      );
      lines.push("");
      uncategorized.forEach(function (w) {
        lines.push(
          "- ❌ `" +
            escapeBackticks(w.component) +
            "` (**" +
            escapeBackticks(w.name || "?") +
            "**) — published page `" +
            escapeBackticks(w.page || "?") +
            "` matches no category",
        );
      });
      lines.push("");
    }

    var preserved = r.categoryDrift || [];
    if (preserved.length > 0) {
      lines.push(
        "### 🛟 " +
          preserved.length +
          " component(s) kept a last-known category (Figma attribution drifted)",
      );
      lines.push("");
      lines.push(
        "A Figma reorg changed how these components are bucketed, so their category " +
          "came back missing or unrecognized. Rather than let them fall out of " +
          "`categories.json`, the docs page tree, and the graph, the sync carried each " +
          "one's **last-known category** (and its section/group) forward, matched " +
          "by stable Figma identity. Nothing is lost, and this self-clears once the file " +
          "settles. If a move is intentional, accept it in " +
          "`components/src/category-page-overrides.json`.",
      );
      lines.push("");
      preserved.forEach(function (d) {
        lines.push(
          "- `" +
            escapeBackticks(d.slug) +
            "` kept **" +
            escapeBackticks(d.from) +
            "** (Figma now reports " +
            (d.observed == null
              ? "no category"
              : "`" + escapeBackticks(d.observed) + "`") +
            (d.page ? " on page `" + escapeBackticks(d.page) + "`" : "") +
            ")",
        );
      });
      lines.push("");
    }

    if (drift.length > 0) {
      lines.push("### Component category drift (warn-only)");
      drift.forEach(function (w) {
        if (w.code === "UNKNOWN_CATEGORY") {
          var members = (w.members || []).map(function (m) {
            return "`" + escapeBackticks(m) + "`";
          });
          lines.push(
            "- ⚠️ Unknown category `" +
              escapeBackticks(w.category) +
              "` (members: " +
              members.join(", ") +
              ")",
          );
        } else if (w.code === "MISSING_KNOWN_CATEGORY") {
          lines.push(
            "- ⚠️ Missing expected category `" +
              escapeBackticks(w.category) +
              "`",
          );
        } else if (w.code === "MEMBER_WITHOUT_CATEGORY") {
          lines.push(
            "- ⚠️ Member page `" +
              escapeBackticks(w.page) +
              "` has no category",
          );
        } else if (w.code === "COMPONENT_ON_CATEGORY_PAGE") {
          lines.push(
            "- ⚠️ Component `" +
              escapeBackticks(w.component) +
              "` sits directly on category page `" +
              escapeBackticks(w.page) +
              "` — EXCLUDED from sync; give it its own member page (5-space indent, plain name) to publish it",
          );
        }
      });
      lines.push("");
    }
  });
  if (errors.length > 0) {
    lines.push("## Errors (" + errors.length + ")");
    lines.push("");
    errors.forEach(function (e) {
      lines.push("- **" + e.label + "**: " + e.error.message);
    });
    lines.push("");
  }
  return lines.join("\n");
}

// ---- Public entry point ----

async function run(opts) {
  opts = opts || {};
  var pluginDir = opts.pluginDir || path.resolve(__dirname, "../..");
  var rest = opts.rest || defaultRest;
  var outputDir =
    opts.outputDir || path.join(pluginDir, "components", "dist", "registries");
  var releaseNotesDir =
    opts.releaseNotesDir || path.join(pluginDir, "release-notes");
  var keysFile = opts.keysFile || path.join(pluginDir, ".figma-keys.json");
  var artifactsDir = opts.artifactsDir || "/tmp";
  var phase = opts.phase || "all";
  var date = opts.date || todayIso();
  var keys = opts.keys || readJsonOrNull(keysFile);
  if (!keys) throw new Error("Cannot read figma keys from " + keysFile);

  // Phase 5 (knowledge v0.11.0): the guidelines slug-set wiring was
  // retired with the components/src/guidelines/ layer. Consumers now
  // resolve guideline docs by slug via the components.guidelineDoc
  // collection in paths-manifest.json.

  // ζ.5: load icon-groups.json — keep the same resolution shape, but
  // its default lookup directory is now an explicit --icon-groups-path.
  var iconGroups = opts.iconGroups || null;
  if (!iconGroups && opts.iconGroupsPath) {
    iconGroups = loadIconGroups(opts.iconGroupsPath);
  }
  var pageOverrides = opts.pageOverrides || loadPageOverrides(pluginDir);
  var deferrals = opts.deferrals || loadDeferrals(pluginDir);

  var orchOpts = {
    rest: rest,
    outputDir: outputDir,
    keys: keys,
    categoriesPath: opts.categoriesPath || null,
    iconGroups: iconGroups,
    pageOverrides: pageOverrides,
  };
  orchOpts.deferrals = deferrals;
  // Derived HERE, not only in the registries phase. The anatomy phase is
  // independently addressable (`--phase anatomy`, the ordinary way to re-run it
  // after a partial night) and the registries assignment below also sits inside
  // a try that can throw. Without this default, a deferred slug's genuinely
  // absent Figma node reads as a fetch FAILURE — the outage alarm the deferred
  // branch exists to avoid — and the deferred report is empty exactly then
  // (#608). The registries phase refines this from deferralState when it runs.
  orchOpts.deferredSlugs = (deferrals || [])
    .filter(function (d) {
      return d && d.kit === "dsKit";
    })
    .map(function (d) {
      return d.slug;
    });
  orchOpts.writeJson = writeJson;
  orchOpts.registriesDir = outputDir;
  orchOpts.anatomyDir = path.join(pluginDir, "components", "dist", "anatomy");
  orchOpts.syncedAt = new Date().toISOString();
  var results = [];
  var errors = [];
  // Renames this run is absorbing, shared across phases. The registries phase
  // computes it; the anatomy phase needs it too, because deleting
  // anatomy/<oldSlug>.json is only a removal when nothing redirects the old
  // slug. Empty on any phase that does not run the registries, which is the
  // safe reading: nothing is absorbed and a deletion stays breaking.
  var absorbedRenames = {};

  async function runWithGuard(label, fn) {
    try {
      var r = await fn();
      results.push(r);
    } catch (err) {
      errors.push({ label: label, error: err });
      if (opts.logger && typeof opts.logger.error === "function") {
        opts.logger.error("[sync] " + label + " failed:", err.message);
      }
    }
  }

  // Rebuild the ledger from THIS RUN's registries, write it, and return the
  // `{fromSlug: toSlug}` index the verdict needs (#552).
  //
  // Built from the computed `after` registries, not from the committed dist,
  // because the whole point is to know where a slug the run is about to rename
  // will land. Kits that failed to compute fall back to their committed
  // registry, so one kit's fetch failure cannot silently erase every other
  // kit's identities and their rename history.
  function absorptionForRun(computedRegistries) {
    var distDir = path.dirname(orchOpts.outputDir);
    var ledgerPath = path.join(distDir, "identity.json");
    var computedFiles = {};
    var registries = computedRegistries.map(function (c) {
      computedFiles[KIT_MAP[c.kitId].outputFile] = true;
      return c.after;
    });
    // 🪤 A kit that failed to compute falls back to its committed registry, and
    // an UNREADABLE one must abandon absorption rather than be skipped. Skipping
    // it would write a ledger missing every identity in that file, including
    // previousSlugs, which is history that cannot be recovered from current
    // state. derive-identity refuses the same thing for the same reason.
    var unreadable = [];
    if (fs.existsSync(orchOpts.outputDir)) {
      fs.readdirSync(orchOpts.outputDir)
        .filter(function (f) {
          return f.endsWith(".json") && !computedFiles[f];
        })
        .sort()
        .forEach(function (f) {
          var reg = readJsonOrNull(path.join(orchOpts.outputDir, f));
          if (reg) registries.push(reg);
          else unreadable.push(f);
        });
    }
    if (unreadable.length > 0) {
      console.warn(
        "[sync] identity ledger NOT updated: unreadable registry " +
          unreadable.join(", ") +
          ". Rewriting it now would drop those identities and their rename " +
          "history, so no rename is absorbed this run.",
      );
      return {};
    }
    if (registries.length === 0) return {};

    // Same rule for the committed ledger: rebuilding from a corrupt one loses
    // every previousSlug silently, and the rename this run wants to absorb is
    // precisely the history being lost.
    var previousRaw = fs.existsSync(ledgerPath)
      ? readJsonOrNull(ledgerPath)
      : null;
    if (fs.existsSync(ledgerPath) && !previousRaw) {
      console.warn(
        "[sync] identity ledger NOT updated: the committed ledger at " +
          ledgerPath +
          " is unreadable, and rebuilding from it would erase every recorded " +
          "rename. No rename is absorbed this run.",
      );
      return {};
    }
    var previous = previousRaw;
    // Which current identity replaces which retired one. Read from the
    // classifier rather than re-derived, so "these two are the same component"
    // is decided once, by the code that also has the display names.
    var rekeyedFrom = {};
    computedRegistries.forEach(function (c) {
      var d = classify._diffRegistry(c.before, c.after);
      (d.rekeyed || []).forEach(function (r) {
        if (r.fromKey && r.toKey) rekeyedFrom[r.toKey] = r.fromKey;
      });
    });
    var ledger = deriveIdentity.buildIdentity(registries, previous, rekeyedFrom);
    var bytes = deriveIdentity.serialize(ledger);

    // 🪤 KNOWN WINDOW, stated rather than half-closed. The ledger is written
    // here, before pass 2 writes the registries it describes, because the
    // verdict needs the index first. If a registry write then fails, dist is
    // briefly inconsistent: identity.json says `action-bar` while dskit.json
    // still says `sticky-footer`. In CI the run verdict is `error`, no PR opens
    // and the runner is discarded, so nothing is published; on a local
    // `npm run sync` it is visible and self-heals on the next successful run.
    // Deferring the write until after pass 2 would close it, at the cost of
    // moving the ledger write away from the code that reasons about it in the
    // highest-stakes script in the repo. Recorded as the smaller risk.
    var current = fs.existsSync(ledgerPath)
      ? fs.readFileSync(ledgerPath, "utf8")
      : null;
    if (current !== bytes) {
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(ledgerPath, bytes);
    }

    // Read back what was written, because the verdict is about to call a rename
    // harmless BECAUSE the ledger records where the slug went. 🪤 Honest about
    // its own strength: this reads the same path in the same process moments
    // after writeFileSync reported success, so it catches a lying filesystem and
    // little else, and there is no test that forces it. It is cheap insurance,
    // NOT a proven guard. What is proven is the degradation below: any doubt
    // returns {} and renames go back to breaking.
    var onDisk = readJsonOrNull(ledgerPath);
    if (!onDisk) {
      throw new Error(
        "sync: the identity ledger could not be read back from " +
          ledgerPath +
          " after writing it, so a rename cannot be classified as absorbed.",
      );
    }
    var index = resolvePaths.buildRenameIndex(onDisk);
    var intended = resolvePaths.buildRenameIndex(ledger);
    var lost = Object.keys(intended).filter(function (from) {
      return index[from] !== intended[from];
    });
    if (lost.length > 0) {
      throw new Error(
        "sync: the identity ledger on disk does not carry the renames this run " +
          "computed (" +
          lost.join(", ") +
          "), so absorption cannot be claimed for them.",
      );
    }

    // 🔑 The ledger says where the old slug WENT. It does not say that anything
    // authored stopped naming it, and several authored files are keyed by slug:
    // the renderer's `case "<slug>"` labels and app-context's `components[]`
    // lists, which derive-graph throws on. Calling such a rename additive opens
    // an auto-merge PR whose required checks can never go green, which is worse
    // than the breaking path, because breaking at least raises a tracking issue
    // a human acts on. So absorption is gated on the PRECONDITION rather than on
    // the ledger alone.
    var verdictOnRenames = renamePreconditions.absorbable(pluginDir, index);
    Object.keys(verdictOnRenames.blocked).forEach(function (from) {
      console.warn(
        "[sync] rename '" +
          from +
          "' -> '" +
          index[from] +
          "' stays BREAKING: authored source still names the old slug in " +
          verdictOnRenames.blocked[from]
            .map(function (h) {
              return path.relative(pluginDir, h.file);
            })
            .join(", ") +
          ". Rename those references, then the sync absorbs it.",
      );
    });
    return verdictOnRenames.absorbable;
  }

  // The ledger spans every kit, but a verdict is always about ONE kit, so an
  // index handed to a kit must be restricted to renames that happened inside it.
  //
  // 🪤 Without this, an FM-Kit rename `foo -> bar` absorbs a genuine DS-Kit
  // deletion of `foo` whenever some unrelated DS-Kit component is named `bar`.
  // The kits do share slug vocabulary (`upload`, `card`), and within-kit slug
  // collisions are a known recurring problem here. classifyRegistry is tighter
  // because it matches BOTH endpoints, but the anatomy check only knows the slug
  // that disappeared, so the restriction has to happen here.
  function restrictToKit(index, computed) {
    var was = (computed && computed.before && computed.before.components) || {};
    var now = (computed && computed.after && computed.after.components) || {};
    var out = {};
    Object.keys(index || {}).forEach(function (from) {
      if (
        Object.prototype.hasOwnProperty.call(was, from) &&
        Object.prototype.hasOwnProperty.call(now, index[from])
      ) {
        out[from] = index[from];
      }
    });
    return out;
  }

  if (phase === "registries" || phase === "all") {
    // Pass 1: compute every kit's `after`. Deliberately NOT pushed into
    // `results`, which carries verdicts; nothing has been classified yet.
    var computedRegistries = [];
    for (var i = 0; i < REGISTRY_KITS.length; i++) {
      var kit = REGISTRY_KITS[i];
      // eslint-disable-next-line no-loop-func
      await (async function (k) {
        try {
          computedRegistries.push(await computeRegistry(orchOpts, k));
        } catch (err) {
          errors.push({ label: "registry:" + k, error: err });
          if (opts.logger && typeof opts.logger.error === "function") {
            opts.logger.error("[sync] registry:" + k + " failed:", err.message);
          }
        }
      })(kit);
    }

    // Between the passes: the ledger, and the renames it absorbs.
    // 🪤 A ledger problem DEGRADES, it does not discard the night. Pushing this
    // into `errors` made aggregateVerdict return "error", which fails the job
    // and produces no PR, no changelog and no tracking issue, so a full disk
    // while writing one file would throw away an otherwise additive sync of the
    // registries, styles, media, icons and tokens. The safe degradation is an
    // empty index: renames simply go back to being breaking, which is exactly
    // where they stood before this existed. The workflow states this invariant
    // in as many words.
    try {
      absorbedRenames = absorptionForRun(computedRegistries);
      // Set on orchOpts HERE, next to the computation, rather than handed to
      // each phase that needs it. The anatomy phase already receives orchOpts,
      // so this is the difference between one assignment and a line every
      // future phase has to remember. 🪤 Not covered by a test: exercising it
      // needs a full `--phase all` run, which stalls before anatomy under the
      // fake REST. What IS tested is both ends, consumerVisibleDeletions and
      // syncAnatomy's use of opts.absorbedRenames.
      var dsComputed = computedRegistries.filter(function (c) {
        return c.kitId === "dsKit";
      })[0];
      // ANATOMY_KITS is dsKit-only, so that is the scope the anatomy phase gets.
      orchOpts.absorbedRenames = dsComputed
        ? restrictToKit(absorbedRenames, dsComputed)
        : {};
      // Same reason and same shape: the anatomy phase must know which slugs are
      // in the registry only because a deferral carries them, so it does not
      // report their genuinely-absent Figma node as a fetch failure every night.
      orchOpts.deferredSlugs =
        dsComputed && dsComputed.deferralState
          ? dsComputed.deferralState.apply.map(function (a) {
              return a.slug;
            })
          : [];
    } catch (err) {
      console.warn(
        "[sync] identity ledger could not be updated (" +
          err.message +
          "). No rename is absorbed this run, so a rename stays breaking.",
      );
    }

    // Fold destinations, read from the ledger the run just wrote. Reused from
    // clients/resolve-paths.js rather than restated, so the sync and every
    // consumer answer "where did this slug go" from the same code.
    var foldedInto = null;
    var foldLedgerPath = path.join(
      path.dirname(orchOpts.outputDir),
      "identity.json",
    );
    var foldLedger = readJsonOrNull(foldLedgerPath);
    if (foldLedger) {
      foldedInto = resolvePaths.buildRenameIndex(foldLedger);
    } else if (fs.existsSync(foldLedgerPath)) {
      // Present but unparseable. readJsonOrNull swallows the error and
      // buildRenameIndex is shape-tolerant, so without this the degradation is
      // silent: every fold reports as a bare removal and nothing says why.
      console.warn(
        "[sync] identity ledger at " +
          foldLedgerPath +
          " is unreadable, so no retired slug can name where it went. Folds " +
          "report as plain removals this run.",
      );
    }

    // Pass 2: classify and write, now that the run knows where renamed slugs go.
    computedRegistries.forEach(function (c) {
      try {
        // 🪤 The ledger spans every kit and the kits share slug vocabulary, so
        // a declaration recorded for one kit must not name a destination in
        // another. Same guard the absorbed renames already use.
        c.foldedInto = restrictToKit(foldedInto, c);
        results.push(finishRegistry(c, restrictToKit(absorbedRenames, c)));
      } catch (err) {
        errors.push({ label: "registry:" + c.kitId, error: err });
        if (opts.logger && typeof opts.logger.error === "function") {
          opts.logger.error(
            "[sync] registry:" + c.kitId + " failed:",
            err.message,
          );
        }
      }
    });
  }

  if (phase === "styles" || phase === "all") {
    for (var j = 0; j < STYLES_KITS.length; j++) {
      var sKit = STYLES_KITS[j];
      // eslint-disable-next-line no-loop-func
      await runWithGuard(
        "styles:" + sKit,
        (
          (k) => () =>
            syncStyles(orchOpts, k)
        )(sKit),
      );
    }
  }

  if (phase === "media-preview" || phase === "all") {
    await runWithGuard("media-preview", function () {
      var mediaOutputDir =
        opts.mediaOutputDir ||
        path.join(pluginDir, "components", "dist", "media");
      // Load the DS Kit registry — either just written by the registries
      // phase (phase === "all") or already on disk (--phase media-preview
      // run in isolation). The phase is a no-op without a registry on disk;
      // not an error.
      var dsKitPath = path.join(outputDir, "dskit.json");
      if (!fs.existsSync(dsKitPath)) {
        return {
          kind: "media-preview",
          category: "unchanged",
          note: "no dskit.json on disk yet",
          fileLabel: "media-preview",
          verdict: {
            category: "unchanged",
            changelog: "_(no dskit.json on disk yet)_",
          },
        };
      }
      var dsKit = JSON.parse(fs.readFileSync(dsKitPath, "utf8"));
      return syncMediaPreview
        .run({
          registry: dsKit,
          outputDir: mediaOutputDir,
          rest: rest,
        })
        .then(function (r) {
          var cat = r.captured.length > 0 ? "additive" : "unchanged";
          var lines = [];
          if (r.captured.length > 0) {
            lines.push("- Captured media for: " + r.captured.join(", "));
          }
          if (r.missing.length > 0) {
            lines.push("- Missing sub-section frame: " + r.missing.join(", "));
          }
          // Surfaced on its own line rather than buried in `missing` (hundreds
          // of entries): on a family page these are components whose wrapper
          // could not be told apart, so nothing was captured on purpose. The
          // fix is a Figma section-header rename, and the line has to say so.
          if (r.unmatchedWrappers && r.unmatchedWrappers.length > 0) {
            lines.push(
              "- ⚠️ No wrapper matched (captured nothing, existing files left alone). " +
                "Name the component in its section header to fix: " +
                r.unmatchedWrappers
                  .map(function (u) {
                    return (
                      u.slug + " (titles: " + JSON.stringify(u.titles) + ")"
                    );
                  })
                  .join("; "),
            );
          }
          if (r.skipped.length > 0) {
            lines.push(
              "- Skipped (excluded category — no capture frames): " +
                r.skipped.length +
                " components",
            );
          }
          if (r.pruned > 0) {
            lines.push("- Pruned " + r.pruned + " stale media file(s).");
          }
          if (r.pruneRefused && r.pruneRefused.length > 0) {
            r.pruneRefused.forEach(function (p) {
              // Cap the slug list — a library-wide refusal can span 80+ slugs
              // and the PR body line should stay readable.
              var shown = p.slugs.slice(0, 10).join(", ");
              var more =
                p.slugs.length > 10
                  ? ", +" + (p.slugs.length - 10) + " more"
                  : "";
              lines.push(
                "- ⚠️ REFUSED mass zero-count prune for role '" +
                  p.role +
                  "' — " +
                  p.slugs.length +
                  " slugs would lose every capture (sub-section rename suspected), files preserved: " +
                  shown +
                  more,
              );
            });
          }
          return {
            kind: "media-preview",
            category: cat,
            captured: r.captured,
            missing: r.missing,
            skipped: r.skipped,
            pruneRefused: r.pruneRefused,
            pruned: r.pruned,
            // Deletions are content changes too — a prune-only night must
            // still open a PR or the deletion is silently re-done forever.
            wrote: r.captured.length > 0 || r.pruned > 0,
            fileLabel: "media-preview",
            verdict: {
              category: cat,
              changelog: lines.length > 0 ? lines.join("\n") : "_(no changes)_",
            },
          };
        });
    });
  }

  if (phase === "anatomy" || phase === "all") {
    var syncAnatomyMod = require("./sync-anatomy");
    for (var a = 0; a < ANATOMY_KITS.length; a++) {
      var aKit = ANATOMY_KITS[a];
      // eslint-disable-next-line no-loop-func
      await runWithGuard(
        "anatomy:" + aKit,
        (
          (k) => () =>
            syncAnatomyMod.syncAnatomy(orchOpts, k)
        )(aKit),
      );
    }
  }

  // media-default: capture each component's default variant in isolation as
  // components/dist/media/<slug>/default.webp — single-component oracles for the
  // fidelity gate. Placed AFTER anatomy so an `all` run reads the freshly
  // synced anatomy dist (the phase resolves each slug's set node from there).
  // No-op (not an error) when dskit.json or the anatomy dir is absent — same
  // guard shape as media-preview, so `--phase media-default` in isolation
  // degrades gracefully before a registries/anatomy run has populated disk.
  if (phase === "media-default" || phase === "all") {
    await runWithGuard("media-default", function () {
      var mediaOutputDir =
        opts.mediaOutputDir ||
        path.join(pluginDir, "components", "dist", "media");
      var anatomyDir = orchOpts.anatomyDir;
      var dsKitPath = path.join(outputDir, "dskit.json");
      if (!fs.existsSync(dsKitPath) || !fs.existsSync(anatomyDir)) {
        return {
          kind: "media-default",
          category: "unchanged",
          note: "no dskit.json or anatomy dir on disk yet",
          fileLabel: "media-default",
          verdict: {
            category: "unchanged",
            changelog: "_(no dskit.json or anatomy dir on disk yet)_",
          },
        };
      }
      var dsKit = JSON.parse(fs.readFileSync(dsKitPath, "utf8"));
      return syncMediaDefault
        .run({
          registry: dsKit,
          anatomyDir: anatomyDir,
          outputDir: mediaOutputDir,
          rest: rest,
          // Same list the anatomy phase gets: this phase reads the anatomy dist
          // that phase carries forward, so it needs the same awareness of which
          // absences are expected.
          deferredSlugs: orchOpts.deferredSlugs,
        })
        .then(function (r) {
          var cat = r.captured.length > 0 ? "additive" : "unchanged";
          var lines = [];
          if (r.captured.length > 0) {
            lines.push(
              "- Captured default oracles for: " + r.captured.join(", "),
            );
          }
          if (r.missing.length > 0) {
            lines.push(
              "- Missing default node (anatomy present, capture failed): " +
                r.missing.join(", "),
            );
          }
          if (r.skipped.length > 0) {
            lines.push(
              "- Skipped (no anatomy yet): " + r.skipped.length + " components",
            );
          }
          return {
            kind: "media-default",
            category: cat,
            captured: r.captured,
            missing: r.missing,
            skipped: r.skipped,
            wrote: r.captured.length > 0,
            fileLabel: "media-default",
            verdict: {
              category: cat,
              changelog: lines.length > 0 ? lines.join("\n") : "_(no changes)_",
            },
          };
        });
    });
  }

  // media-index: re-derive components/dist/media/_index.json inside the SAME
  // sync run whenever a media phase ran. Previously the sync wrote media
  // without the sidecar and relied on guidelines-derive's auto-commit to heal
  // it afterwards — stacking a second version bump per sync (the phantom
  // untagged versions, e.g. 0.34.66-67). writeMediaIndex is already
  // byte-compare-gated, so a no-op night writes nothing here.
  // `media-index` is also addressable on its own. It makes no Figma calls (it is
  // a pure re-derive of the media tree on disk), so running it standalone lets
  // the phase gate be tested end-to-end, and lets an operator re-derive the
  // index without a full nightly sync.
  if (
    phase === "media-preview" ||
    phase === "media-default" ||
    phase === "media-index" ||
    phase === "all"
  ) {
    await runWithGuard("media-index", function () {
      var mediaOutputDir =
        opts.mediaOutputDir ||
        path.join(pluginDir, "components", "dist", "media");
      // Addressed by the media dir itself — no repo-root shape inference, so
      // a custom mediaOutputDir can never index a different tree.
      var writeMediaIndexAt =
        require("../components/derive-media-index").writeMediaIndexAt;
      var r = writeMediaIndexAt(mediaOutputDir);
      // _index.json is the surface consumers actually resolve imagery through,
      // so classifying HERE catches media loss from ANY upstream phase: a prune
      // in media-preview, a vanished default capture, a whole slug going away.
      //
      // This used to be `r.wrote ? "additive" : "unchanged"`, with no path to
      // breaking. Since the index is a pure directory listing with no memory,
      // 60 slugs disappearing and 60 appearing produced the identical verdict,
      // and a prune-only night auto-merged a PR that had deleted images. Same
      // shape as the icons bug that shipped 29 dead glyphs.
      var mediaVerdict = classify({
        fileKind: "media",
        before: r.before || { media: {} },
        after: r.after || { media: {} },
        beforeUnparseable: r.beforeUnparseable === true,
      });
      var lines = [];
      if (r.wrote) {
        lines.push(
          "- Regenerated media/_index.json (" + r.slugCount + " slugs).",
        );
      }
      if (mediaVerdict.category !== "unchanged") {
        lines.push("");
        lines.push(mediaVerdict.changelog);
      }
      // The classifier only speaks about entries appearing and disappearing. A
      // byte change with no entry change (a path string, a re-order) is still a
      // real dist change and must stay tagged as additive, or the version bump
      // never fires and consumers pin a version that does not contain it.
      var mediaCat = mediaVerdict.category;
      if (mediaCat === "unchanged" && r.wrote) mediaCat = "additive";
      return {
        kind: "media-index",
        category: mediaCat,
        wrote: r.wrote === true,
        fileLabel: "media/_index.json",
        verdict: {
          category: mediaCat,
          reasons: mediaVerdict.reasons,
          changelog: lines.length > 0 ? lines.join("\n") : "_(no changes)_",
        },
      };
    });
  }

  // icons: export + normalize the monochrome UI icons (category "Icons",
  // primary group != "Connector") to components/src/icons-svg.auto.json, then
  // re-derive components/dist/icons/icons.json (auto ⊕ curated override). No-op
  // (not an error) when dskit.json or icon-groups isn't available yet — same
  // guard shape as media-default.
  if (phase === "icons" || phase === "all") {
    await runWithGuard("icons", function () {
      var dsKitPath = path.join(outputDir, "dskit.json");
      if (!fs.existsSync(dsKitPath) || !orchOpts.iconGroups) {
        return {
          kind: "icons",
          category: "unchanged",
          fileLabel: "icons",
          verdict: {
            category: "unchanged",
            changelog: "_(no dskit.json or icon-groups on disk yet)_",
          },
        };
      }
      var dsKit = JSON.parse(fs.readFileSync(dsKitPath, "utf8"));
      var curatedPath = path.join(
        pluginDir,
        "components",
        "src",
        "icons-svg.json",
      );
      var curated = readJsonOrNull(curatedPath) || { icons: {} };
      // Snapshot the DERIVED icon set before the phase overwrites it. This is
      // what consumers actually resolve glyphs from, and the only way to see
      // that an icon which used to resolve no longer does.
      var iconsDistPath = path.join(
        pluginDir,
        "components",
        "dist",
        "icons",
        "icons.json",
      );
      // NOT readJsonOrNull: that swallows a parse error into null, which here
      // would degrade to an empty "before" set, make every icon look newly
      // gained, and report ADDITIVE. A corrupt icons.json would therefore
      // silently disable the very gate this phase exists to enforce. Absent is
      // fine (first run); unparseable is not.
      var iconsBefore = { icons: {} };
      if (fs.existsSync(iconsDistPath)) {
        iconsBefore = JSON.parse(fs.readFileSync(iconsDistPath, "utf8"));
      }
      return syncIcons
        .run({
          registry: dsKit,
          iconGroups: orchOpts.iconGroups,
          curatedSlugs: new Set(Object.keys(curated.icons || {})),
          autoOutPath: path.join(
            pluginDir,
            "components",
            "src",
            "icons-svg.auto.json",
          ),
          degradedOutPath: path.join(
            pluginDir,
            "components",
            "dist",
            "icons",
            "icons.degraded.json",
          ),
          rest: rest,
        })
        .then(function (r) {
          // deriveAndWrite re-reads the curated icons-svg.json from disk and
          // derives `curatedSlugs` itself for the resilience guard (a dangling
          // curated slug warns+skips rather than failing the whole sync), so we
          // don't forward it here.
          var derived = deriveIconsMod.deriveAndWrite({
            pluginDir: pluginDir,
            registry: dsKit,
            iconGroups: orchOpts.iconGroups,
          });
          // Classify against the icon set consumers actually see. Losing a
          // previously-clean glyph is BREAKING: that slug now resolves to
          // nothing and every consumer renders an empty box.
          //
          // This used to be `iconsWrote ? "additive" : "unchanged"` with no
          // diff at all. When the Figma icon rework made 28 glyphs stop
          // rendering, the sync called it additive, auto-merged, and shipped
          // the loss (#365 + #378, 2026-07-07/08). The degraded worklist below
          // WAS printed in those PR bodies; nobody read it, because additive
          // PRs auto-merge. The verdict is what gates the merge, so the verdict
          // has to know.
          var iconsWrote = r.wrote === true || derived.wrote === true;
          var verdict = classify({
            fileKind: "icons",
            before: iconsBefore,
            after: derived.dist,
            degraded: r.degraded,
          });
          var lines = [];
          if (iconsWrote && r.exported.length > 0) {
            lines.push(
              "- Exported icon SVG for " + r.exported.length + " UI icons",
            );
          }
          if (r.degraded.length > 0) {
            lines.push(
              "- Degraded worklist (" +
                r.degraded.length +
                "): " +
                r.degraded
                  .map(function (d) {
                    return d.slug + " (" + d.reason + ")";
                  })
                  .join(", "),
            );
          }
          if (r.ghosts && r.ghosts.length > 0) {
            lines.push(
              "- ⚠️ **Stale registry**: " +
                r.ghosts.length +
                " component(s) advertised by Figma's published-library endpoint " +
                "have no canvas node: " +
                r.ghosts.join(", "),
            );
          }
          if (verdict.changelog && verdict.category !== "unchanged") {
            lines.push("");
            lines.push(verdict.changelog);
          }
          return {
            kind: "icons",
            category: verdict.category,
            exported: r.exported,
            degraded: r.degraded,
            wrote: iconsWrote,
            fileLabel: "icons",
            verdict: {
              category: verdict.category,
              reasons: verdict.reasons,
              changelog: lines.length > 0 ? lines.join("\n") : "_(no changes)_",
            },
          };
        });
    });
  }

  // graphics: export the color-preserving artwork tier (illustrations, the
  // pyramid mark, partner logos) via the curated slug->nodeId artworkMap
  // (SLICE1_ARTWORK, since real artwork lives at specific variant/sub-nodes,
  // not swept from a registry category, per docs/superpowers/graphics-slice1-
  // findings.md), then re-derive components/dist/graphics/graphics.json
  // (auto ⊕ curated override). No-op (not an error) when dskit.json isn't
  // available yet, same guard shape as icons/media-default; the artwork
  // map's node ids live on the dsKit file, so its fileKey is where the
  // export reads from.
  //
  // Unlike icons, this phase does not classify a lost-vs-gained slug as
  // breaking: changelog-classifier's classify() has no "graphics" fileKind
  // (adding one is a shared-classifier change, out of scope for this
  // wiring), and the design assigns loss protection to the derive-time
  // fidelity gate instead (it asserts each wired consumer's rendered
  // fragment actually embeds real artwork, so a broken export cannot
  // silently regress a render to blank). The TAG-GAP escalation below still
  // promotes any real write to "additive", so a change always reaches a
  // version and a tag; this mirrors the simpler wrote-based verdict already
  // used by the media-preview/media-default/anatomy phases above.
  if (phase === "graphics" || phase === "all") {
    await runWithGuard("graphics", function () {
      var dsKitPath = path.join(outputDir, "dskit.json");
      if (!fs.existsSync(dsKitPath)) {
        return {
          kind: "graphics",
          category: "unchanged",
          fileLabel: "graphics",
          verdict: {
            category: "unchanged",
            changelog: "_(no dskit.json on disk yet)_",
          },
        };
      }
      var dsKit = JSON.parse(fs.readFileSync(dsKitPath, "utf8"));
      return syncGraphics
        .run({
          fileKey: dsKit.fileKey,
          artworkMap: syncGraphics.SLICE1_ARTWORK,
          rest: rest,
        })
        .then(function (r) {
          var derived = deriveGraphicsMod.deriveAndWrite({
            pluginDir: pluginDir,
          });
          var graphicsWrote = r.wrote === true || derived.wrote === true;
          var cat = graphicsWrote ? "additive" : "unchanged";
          var lines = [];
          if (r.exported.length > 0) {
            lines.push(
              "- Exported artwork SVG for " + r.exported.length + " graphics",
            );
          }
          if (r.degraded.length > 0) {
            lines.push(
              "- Degraded worklist (" +
                r.degraded.length +
                "): " +
                r.degraded
                  .map(function (d) {
                    return d.slug + " (" + d.reason + ")";
                  })
                  .join(", "),
            );
          }
          return {
            kind: "graphics",
            category: cat,
            exported: r.exported,
            degraded: r.degraded,
            wrote: graphicsWrote,
            fileLabel: "graphics",
            verdict: {
              category: cat,
              changelog: lines.length > 0 ? lines.join("\n") : "_(no changes)_",
            },
          };
        });
    });
  }

  var category = aggregateVerdict(results, errors);
  // TAG-GAP rule: consumers vendor by TAG RANGE, so ANY vendorable content
  // that reaches disk must reach a version/tag — and the workflow only opens
  // a PR for additive/breaking verdicts. A byte-level write with an
  // entry-level "unchanged" verdict (e.g. the one-time key-order
  // canonicalization migration, or a timestamp-preserving rewrite) therefore
  // escalates to additive; a night with zero writes stays unchanged and
  // produces no PR, no bump, no tag — a true no-op.
  var anyWrote = results.some(function (r) {
    return r && r.wrote === true;
  });
  var maintenanceOnly = false;
  if (category === "unchanged" && anyWrote) {
    category = "additive";
    maintenanceOnly = true;
  }
  var exitCode = exitCodeFor(category);
  var changelog = buildChangelog(date, category, results, errors);
  if (maintenanceOnly) {
    changelog +=
      "\n_Byte-level maintenance writes only (canonicalization / ordering migration); no entry-level registry changes._\n";
  }

  // Per-day release notes
  fs.mkdirSync(releaseNotesDir, { recursive: true });
  var releasePath = path.join(releaseNotesDir, "sync-" + date + ".md");
  fs.writeFileSync(releasePath, changelog, "utf8");

  // Workflow handoff artifacts
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(
    path.join(artifactsDir, "sync-verdict.txt"),
    category + "\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(artifactsDir, "sync-changelog.md"),
    changelog,
    "utf8",
  );
  // Category-drift handoff: how many components kept a last-known category
  // because Figma page attribution churned. The workflow raises/auto-resolves
  // a non-blocking `category-drift` issue from this count, so a reshuffle
  // reaches a human without reding the sync.
  var driftCount = results.reduce(function (n, r) {
    return n + ((r && r.categoryDrift && r.categoryDrift.length) || 0);
  }, 0);
  fs.writeFileSync(
    path.join(artifactsDir, "sync-drift.txt"),
    driftCount + "\n",
    "utf8",
  );

  // Failure-kind handoff, same shape as the drift handoff above: the workflow's
  // notify step reads it so the tracking issue can state the actual remedy
  // ("rotate the Figma token") instead of a guess.
  var kind = failureKind(errors);
  fs.writeFileSync(
    path.join(artifactsDir, "sync-failure-kind.txt"),
    kind + "\n",
    "utf8",
  );

  // Auto-bump plugin.json patch when generated data actually changed.
  // Cowork (cloud) re-pulls plugin per session and reads from the bumped
  // version; without this, designers see stale registries/styles until the
  // next manual ship. Skip on `unchanged` (no diff) and `error` (failed run).
  //
  // Only fires when opts.pluginJsonPath is set explicitly (CLI passes it;
  // tests omit it). This keeps test fixtures from polluting the real
  // plugin.json when their mock REST data produces additive/breaking diffs.
  var bumpedFrom = null;
  var bumpedTo = null;
  var pluginJsonPath = opts.pluginJsonPath || null;
  // (anyWrote already escalated unchanged→additive above, so this condition
  // now also covers byte-level-only maintenance writes.)
  if (
    pluginJsonPath &&
    (category === "additive" || category === "breaking") &&
    fs.existsSync(pluginJsonPath)
  ) {
    var bumpVersion = require("../lib/bump-version.js");
    var plugin = JSON.parse(fs.readFileSync(pluginJsonPath, "utf8"));
    bumpedFrom = plugin.version;
    bumpedTo = bumpVersion(bumpedFrom, "patch");
    plugin.version = bumpedTo;
    fs.writeFileSync(
      pluginJsonPath,
      JSON.stringify(plugin, null, 2) + "\n",
      "utf8",
    );
    // Keep package-lock.json's version fields in lockstep (see stampLockfile).
    bumpVersion.stampLockfile(path.dirname(pluginJsonPath), bumpedTo);
  }

  // Also bump paths-manifest.json#knowledge_version if a manifest path is
  // supplied. Mirrors the package.json bump above. Introduced 2026-05-11
  // (knowledge v0.3.7) — pre-existing manifest assertion requires
  // knowledge_version === package.json#version on every sync.
  //
  // Routed through the single-writer helper, which derives knowledge_version
  // from the just-bumped package.json (the manifest is a sibling of
  // pluginJsonPath — both at the repo root in the workflow, both in the
  // tmpdir in tests). Still gated on `bumpedTo` so an unchanged verdict
  // leaves the manifest alone, and on `manifestPath` so a programmatic caller
  // that omits it never touches the manifest (backwards compat).
  var manifestPath = opts.manifestPath || null;
  if (manifestPath && bumpedTo && fs.existsSync(manifestPath)) {
    syncKnowledgeVersion(path.dirname(manifestPath));
  }

  // Auto-stub: generate guideline stubs for any new set-importable
  // components that landed in this sync. No-op on unchanged. Idempotent —
  // existing guideline files are never overwritten (skip-if-exists in
  // generateStubs). Stubs land in the same PR as the registry diff via
  // Phase 5 (knowledge v0.11.0): the auto-stub block that wrote
  // components/src/guidelines/<slug>.json for additive/breaking syncs
  // was retired. Per-component guideline docs are authored under
  // components/src/<slug>/ (Phase 2a) and derived into
  // components/dist/guidelines/<slug>.json by scripts/components/__cli.js.

  return {
    category: category,
    exitCode: exitCode,
    results: results,
    errors: errors,
    failureKind: kind,
    releasePath: releasePath,
    changelog: changelog,
    bumpedFrom: bumpedFrom,
    bumpedTo: bumpedTo,
  };
}

// ---- CLI ----

function parseArgs(argv) {
  var out = { phase: "all" };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    var next = function () {
      return argv[++i];
    };
    if (a === "--phase") out.phase = next();
    else if (a === "--output-dir") out.outputDir = next();
    else if (a === "--release-notes-dir") out.releaseNotesDir = next();
    else if (a === "--keys-file") out.keysFile = next();
    else if (a === "--artifacts-dir") out.artifactsDir = next();
    else if (a === "--plugin-dir") out.pluginDir = next();
    else if (a === "--plugin-json-path") out.pluginJsonPath = next();
    else if (a === "--manifest-path") out.manifestPath = next();
    else if (a === "--categories-path") out.categoriesPath = next();
    else if (a === "--icon-groups-path") out.iconGroupsPath = next();
  }
  return out;
}

if (require.main === module) {
  var cliOpts = parseArgs(process.argv.slice(2));
  // CLI mode (e.g., GitHub Action) defaults pluginJsonPath to plugin.json
  // under the resolved pluginDir, so auto-bump fires without explicit
  // wiring. Programmatic callers (tests, scripts) must opt in by passing
  // pluginJsonPath explicitly — keeps test fixtures from polluting the
  // real plugin.json on additive/breaking verdicts from mock data.
  var resolvedPluginDir = cliOpts.pluginDir || path.resolve(__dirname, "../..");
  if (!cliOpts.pluginJsonPath) {
    cliOpts.pluginJsonPath = path.join(
      resolvedPluginDir,
      ".claude-plugin",
      "plugin.json",
    );
  }
  run(cliOpts).then(
    function (r) {
      console.log("[sync] verdict=" + r.category + " exit=" + r.exitCode);
      if (r.errors.length > 0) {
        if (r.failureKind === "auth") {
          // First line a reader sees, because it is the whole diagnosis: no
          // phase got past its first request, so nothing below is about content.
          console.error(
            "[sync] FAILURE KIND: auth — Figma rejected the credential on every " +
              "phase. Rotate the Figma PAT and update the FIGMA_KEYS_JSON secret; " +
              "nothing below indicates a content or override problem.",
          );
        }
        r.errors.forEach(function (e) {
          console.error(
            "[sync]   error in " + e.label + ": " + e.error.message,
          );
        });
      }
      console.log("[sync] release notes: " + r.releasePath);
      process.exit(r.exitCode);
    },
    function (err) {
      console.error("[sync] FATAL:", err.message);
      process.exit(2);
    },
  );
}

module.exports = {
  run: run,
  parseArgs: parseArgs,
  excludeDeniedPages: excludeDeniedPages,
  isDeniedPage: isDeniedPage,
  suppressDeniedPageCollisions: suppressDeniedPageCollisions,
  DENIED_PAGES: DENIED_PAGES,
  loadPageOverrides: loadPageOverrides,
  loadDeferrals: loadDeferrals,
  categoryCounts: categoryCounts,
  preserveKnownCategories: preserveKnownCategories,
  assertNoEmojiInNames: assertNoEmojiInNames,
  assertNoCategoryMassLoss: assertNoCategoryMassLoss,
  isAuthError: isAuthError,
  failureKind: failureKind,
};
