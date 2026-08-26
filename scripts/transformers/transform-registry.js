"use strict";

// Transforms Figma REST payloads into a kit registry JSON, matching the shape
// produced by the existing /sync-design-system Phase 1 (sync-phases.md).
//
// Pure function — no I/O, no globals. The orchestrator (sync-from-figma.js)
// is responsible for fetching REST data and writing the registry file.
//
// Input shape:
//   {
//     library:            "ds" | "fm" | "meta-kit",
//     fileKey:            string,
//     componentSets:      Array<RestComponentSet>      // from /v1/files/:key/component_sets meta.component_sets
//     componentSetNodes:  Object<nodeId, NodePayload>  // batched /v1/files/:key/nodes?ids=…
//     standalones:        Array<RestComponent>         // pre-filtered standalones (parent !== COMPONENT_SET, not internal)
//     standaloneNodes:    Object<nodeId, NodePayload>  // batched /nodes for standalones
//     documentChildren:   Array<CanvasNode>            // OPTIONAL — file's pages tree for category inference (DS Kit only)
//     iconGroups:         Object<label, slug[]>        // OPTIONAL — curated mapping from components/src/icon-groups.json. ζ.5: layered onto icon entries (category === "Icons") to replace the uniform "Actual icons" group with semantic labels (Connector / Status / Navigation / …). Multi-group icons get `secondaryGroups`.
//   }
//
// Output: registry JSON, same shape as components/registries/{dskit,fmkit,metakit}.json.

var categoriesModule = require("./transform-categories.js");
var inferCategoryMap = categoriesModule.inferCategoryMap;
var KNOWN_CATEGORIES = categoriesModule.KNOWN_CATEGORIES;
var statusParser = require("./component-status-emoji.js");

function slugify(name) {
  // Lowercase + hyphenated. "Button" → "button"; "Tab Bar" → "tab-bar".
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isInternalName(name) {
  return typeof name === "string" && name.startsWith(".");
}

function pageNameFromContainingFrame(cf) {
  // REST returns page names with Figma's indent prefix (whitespace marking
  // hierarchy depth). Trim to match the existing registry shape.
  if (!cf) return "unknown";
  var raw = cf.pageName || cf.name || "unknown";
  return String(raw).trim();
}

function trimDescription(s) {
  s = s || "";
  // Normalize whitespace-only strings to empty string so callers can do a
  // simple truthiness check: `entry.description || fallback`.
  if (s.trim() === "") return "";
  return s;
}

// Convert REST `componentPropertyDefinitions` into our two output shapes:
//   variants: { axisName: [values, …] }   (VARIANT-typed entries only)
//   properties: { hashKey: { type, default } }   (everything else)
function splitVariantAndProperties(definitions) {
  var variants = null;
  var properties = {};
  if (!definitions || typeof definitions !== "object") {
    return { variants: variants, properties: properties };
  }
  Object.keys(definitions).forEach(function (key) {
    var def = definitions[key];
    if (!def || typeof def !== "object") return;
    if (def.type === "VARIANT") {
      if (variants === null) variants = {};
      variants[key] = Array.isArray(def.variantOptions)
        ? def.variantOptions.slice()
        : [];
      return;
    }
    properties[key] = {
      type: def.type,
      default: def.defaultValue,
    };
  });
  return { variants: variants, properties: properties };
}

// ζ.2 (2026-05-13): derive the third-axis `group` field from Figma's
// containing_frame structure. Lets docs sidebar IA collapse multi-component
// pages (Tag's 9 variants, Loading's 4, Empty state's 4, etc.) into one
// sidebar node with N children.
//
// For COMPONENTS-section items: group = page clean-name (e.g.,
//   "Tag (Identification key)" for all 9 Tag variants).
// For FOUNDATIONS / BRAND items: prefer containing_frame.name when it
//   differs from the page clean-name (icons typically live in named
//   sub-frames like "Navigation icons"); fall back to page clean-name.
// Figma names a frame automatically when the designer does not: "Group 42",
// "Frame 1207", "Vector", "Rectangle 4". Those are canvas layout, not taxonomy,
// and they were reaching the docs as navigation sections: "Group 42" and
// "Group 43" held 90 partner logos between them, and the two overlap
// alphabetically (adlsgen1..snowflake, db2-database-1..xml), which is the proof
// they carry no meaning. Fall back to the page, which is the real bucket.
var FIGMA_AUTONAME_RE =
  /^(group|frame|vector|rectangle|ellipse|line|polygon|star|union|subtract|intersect|exclude|component|instance|slice)(\s+\d+)?$/i;

function isFigmaAutoName(name) {
  return FIGMA_AUTONAME_RE.test(String(name).trim());
}

function deriveGroup(meta, section, pageCleanName) {
  var frameName = meta && meta.containing_frame && meta.containing_frame.name;
  if (
    section &&
    section !== "Components" &&
    frameName &&
    String(frameName).trim() &&
    String(frameName).trim() !== pageCleanName &&
    !isFigmaAutoName(frameName)
  ) {
    return String(frameName).trim();
  }
  return pageCleanName;
}

// ζ.5 (2026-05-13): for icons specifically, the registry-time `group`
// from containing_frame.name is uniformly "Actual icons" (every icon
// COMPONENT_SET lives in that one frame). The semantic categorization
// (Connector / Status / Navigation / etc.) lives one level deeper in
// the Figma layout — captured by the curated mapping at
// components/src/icon-groups.json. This helper applies that mapping:
//   - sets `group` to the primary semantic label (first-listed in the
//     mapping; specific-first ordering — Cursor over Common, etc.)
//   - sets `secondaryGroups` to the additional labels when an icon
//     belongs to multiple groups (8 icons today: add / download /
//     directory / book-bookmark / minimize / export / process / dataset)
//   - falls back to "Other" when an icon isn't in the mapping (e.g.,
//     a designer just added one and hasn't classified it yet)
function applyIconGroups(entry, slug, iconGroupsLookup) {
  if (!iconGroupsLookup || entry.category !== "Icons") return;
  var groups = iconGroupsLookup[slug];
  if (!groups || groups.length === 0) {
    entry.group = "Other";
    return;
  }
  entry.group = groups[0];
  if (groups.length > 1) {
    entry.secondaryGroups = groups.slice(1);
  }
}

function buildEntry(
  meta,
  node,
  importMethod,
  categoryEntry,
  slug,
  iconGroupsLookup,
) {
  var doc = (node && node.document) || {};
  var split = splitVariantAndProperties(doc.componentPropertyDefinitions);

  var pageName = pageNameFromContainingFrame(meta.containing_frame);
  var pageCleanName =
    statusParser.extractStatus(pageName).cleanName || pageName;

  // Status is authored ON THE COMPONENT (Figma DS Kit v2.7.0, 2026-08-26).
  // The reorg stripped the status emoji from every member page name and put it
  // on the component itself, so the component name is the ONLY status driver.
  // The emoji is stripped from the shipped `name` — leaving it in would ship
  // "✍️ Badge" as a display name to the docs site and the plugin.
  //
  // The page deliberately does NOT contribute status any more. `/components`
  // returns `containing_frame.pageName` as of the last publish, so a page
  // renamed without republishing keeps its old emoji; a page-derived status is
  // therefore a stale-metadata artifact rather than a signal. One field, one
  // driver.
  var componentStatus = statusParser.extractStatus(meta.name);

  // Figma REST exposes documentationLinks on COMPONENT_SET node documents.
  // Shape: [{ uri: string }]. Pass through verbatim (preserves Figma's
  // representation; consumers can extract `.uri` themselves).
  var documentationLinks = Array.isArray(doc.documentationLinks)
    ? doc.documentationLinks
    : [];

  // Phase 5 (knowledge v0.11.0): `guidelinesFile` was retired with the
  // scraped components/src/guidelines/ layer. Consumers now resolve per-
  // component guideline docs by slug via PATHS.components.guidelineDoc.byKey
  // (components/dist/guidelines/<slug>.json, domains.* shape).

  var entry = {
    name: componentStatus.cleanName || meta.name,
    key: meta.key,
    nodeId: meta.node_id,
    importMethod: importMethod,
    description: trimDescription(meta.description),
    page: pageName,
    properties: split.properties,
    nestedComponents: [],
    documentationLinks: documentationLinks,
  };

  // ζ.2 (2026-05-13): three-axis grouping. `section` (top-level marker,
  // e.g. "Components"/"Foundations"/"Brand") + `category` (existing
  // semantic — now also populated for non-COMPONENTS items, was null)
  // + `group` (third level, page clean-name for components / frame name
  // for icons). All three are additive; consumers that read only
  // `category` keep working.
  if (categoryEntry) {
    if (categoryEntry.section != null) {
      entry.section = categoryEntry.section;
    }
    if (categoryEntry.category != null) {
      entry.category = categoryEntry.category;
      entry.categorySlug = slugify(categoryEntry.category);
    }
    entry.group = deriveGroup(meta, categoryEntry.section, pageCleanName);
    // ζ.5 (2026-05-13): for icons, overwrite `group` with the semantic
    // label from icon-groups.json (and add `secondaryGroups` for icons
    // that span multiple groups). For non-icons this is a no-op.
    applyIconGroups(entry, slug, iconGroupsLookup);
  }

  // `null` means curated/healthy, which stays implicit (no field), mirroring
  // the foundations precedent for ✅.
  if (componentStatus.status != null) {
    entry.status = componentStatus.status;
  }

  if (importMethod === "set") {
    entry.variants = split.variants || {};
  }
  return entry;
}

function transformRegistry(input) {
  var library = input.library;
  var fileKey = input.fileKey;
  var componentSets = input.componentSets || [];
  var componentSetNodes = input.componentSetNodes || {};
  var standalones = input.standalones || [];
  var standaloneNodes = input.standaloneNodes || {};
  var documentChildren = input.documentChildren || null;
  var pageOverridesCfg = input.pageOverrides || {};
  // Defensive: tolerate a malformed hand-authored config (wrong shapes) instead
  // of throwing a low-level TypeError deep in the sync. A non-object `overrides`
  // or a non-array `exclude` is treated as absent.
  var pageOverridesMap =
    pageOverridesCfg.overrides && typeof pageOverridesCfg.overrides === "object"
      ? pageOverridesCfg.overrides
      : {};
  var excludeSet = {};
  var excludeList = Array.isArray(pageOverridesCfg.exclude)
    ? pageOverridesCfg.exclude
    : [];
  excludeList.forEach(function (name) {
    excludeSet[name] = true;
  });
  // Phase 5 (knowledge v0.11.0): `input.guidelinesSlugSet` was retired
  // along with the `guidelinesFile` registry field — consumers now resolve
  // per-component guideline docs by slug via the components.guidelineDoc
  // collection in paths-manifest.json instead.
  // ζ.5: invert the icon-groups.json shape (group→[slugs]) into a
  // per-slug lookup (slug→[groups]) once, then pass to buildEntry. The
  // first listed group is primary (specific-first priority encoded by
  // the file's key order); subsequent groups become `secondaryGroups`.
  var iconGroupsLookup = null;
  if (input.iconGroups && typeof input.iconGroups === "object") {
    iconGroupsLookup = {};
    Object.keys(input.iconGroups).forEach(function (label) {
      if (label.charAt(0) === "_") return; // skip _naming_convention etc.
      var slugs = input.iconGroups[label];
      if (!Array.isArray(slugs)) return;
      slugs.forEach(function (slug) {
        if (!iconGroupsLookup[slug]) iconGroupsLookup[slug] = [];
        if (iconGroupsLookup[slug].indexOf(label) < 0) {
          iconGroupsLookup[slug].push(label);
        }
      });
    });
  }
  var lastSyncedIso = new Date().toISOString();

  var registry = {
    library: library,
    fileKey: fileKey,
    lastSynced: lastSyncedIso,
    componentCount: 0,
    components: {},
    // ICONS GET THEIR OWN NAMESPACE.
    //
    // A design system may legitimately ship a `calendar` ICON and a `Calendar`
    // COMPONENT, and it does. They are different KINDS of thing, and the sync can
    // tell which is which — an icon comes off an Icons page, so its category is
    // "Icons". Forcing them to share one flat slug-keyed map means one of them has
    // to lose, and the loser does not get renamed, it VANISHES.
    //
    // That is what ate the `calendar` icon and the `search` icon (2026-07-13): the
    // Calendar and Search *components* own those slugs in `components`, so the
    // icons were dropped and the DS shipped with neither glyph. Renaming in Figma
    // would only postpone it — `link`, `table`, `settings` are all names an icon
    // and a component can reasonably both want, so the clash recurs forever.
    //
    // So icons are ALSO collected here, keyed by their own name, where nothing can
    // take their slug. `components` keeps its existing behaviour untouched (the
    // component still wins that map, so no consumer key changes and this is purely
    // additive); the icon pipeline reads THIS map instead of filtering `components`
    // by category, and therefore stops losing icons to component names.
    icons: {},
  };

  // Build category lookup once. The map is keyed by the component
  // cleanName (e.g., "Button"), so we look up by meta.name rather than
  // the page-name string. Warnings are surfaced via input.onWarnings if
  // the caller wants them.
  var categoryMap = null;
  if (documentChildren) {
    var inference = inferCategoryMap(documentChildren, pageOverridesMap);
    categoryMap = inference.map;
    if (typeof input.onWarnings === "function") {
      input.onWarnings(inference.warnings);
    }
  }

  // The categoryMap is keyed by page clean-name (e.g., "Tag (Identification key)"),
  // not by component name. A single page can host multiple components (tag-*,
  // loading variants, data-viz variants); they all share the page's category.
  // Look up by the component's containing_frame.pageName with the status
  // emoji stripped. Also returns the derived cleanPage so callers can detect
  // the "component frame sits directly on a category-header page" case
  // (header pages are never in categoryMap, so this would otherwise miss
  // silently — see COMPONENT_ON_CATEGORY_PAGE below).
  function lookupCategoryEntry(meta) {
    var pageName =
      (meta && meta.containing_frame && meta.containing_frame.pageName) || "";
    var cleanPage = statusParser.extractStatus(pageName).cleanName;
    var entry =
      categoryMap && cleanPage ? categoryMap[cleanPage] || null : null;
    // Plane-B override fallback: a page-level override normally fires in
    // inferCategoryMap on the Pages-panel canvas name. But a component's own
    // containing_frame.pageName can diverge from the canvas name (the icons
    // page shows "DS Icons" in the panel while the icon components report
    // "Icons"). When the canvas-side entry is missing, resolve the override
    // directly from the component's clean page name so the join does not
    // depend on the two names agreeing.
    if (
      !entry &&
      cleanPage &&
      Object.prototype.hasOwnProperty.call(pageOverridesMap, cleanPage)
    ) {
      entry = {
        section: null,
        category: pageOverridesMap[cleanPage],
        status: null,
      };
    }
    return { entry: entry, cleanPage: cleanPage };
  }

  // Component-level warnings collected alongside the two buildEntry loops
  // below: a component whose page resolves to no categoryMap entry AND
  // whose clean page name is itself a known category header means the
  // component's frames live directly on the category canvas instead of
  // their own member page. Only meaningful when category inference
  // actually ran (categoryMap non-null); kits without page-category
  // structure (FM/Meta Kit) never pass documentChildren and shouldn't
  // emit these.
  //
  // Vincent's rule (2026-07-02): this is a publish gate, not just a
  // warning — the component is EXCLUDED from registry.components (see
  // isOnCategoryHeaderPage below); the page convention is how a component
  // gets published at all. The warning still fires so the sync PR
  // changelog surfaces the exclusion.
  var componentWarnings = [];
  var seenComponentWarnings = {};
  function isOnCategoryHeaderPage(lookup) {
    if (!categoryMap) return false;
    if (lookup.entry) return false;
    if (!lookup.cleanPage) return false;
    return KNOWN_CATEGORIES.indexOf(lookup.cleanPage) >= 0;
  }
  function collectComponentWarning(lookup, slug) {
    if (!isOnCategoryHeaderPage(lookup)) return;
    var dedupeKey = lookup.cleanPage + "|" + slug;
    if (seenComponentWarnings[dedupeKey]) return;
    seenComponentWarnings[dedupeKey] = true;
    componentWarnings.push({
      code: "COMPONENT_ON_CATEGORY_PAGE",
      page: lookup.cleanPage,
      component: slug,
    });
  }

  // A standalone lost the slug to a component set. It is being dropped from the
  // registry entirely — say so by name, with both sides and their node ids, so a
  // human can open the two nodes in Figma and rename one.
  // Normalize the two shapes a collision side can arrive in: a raw Figma REST
  // `meta` (not yet built) or an already-built registry `entry`.
  function metaSide(meta, lookup, importMethod) {
    return {
      // Cleaned, because entrySide reads an already-built entry whose `name`
      // has had its status emoji stripped. Comparing a raw name against a
      // cleaned one made two masters of `✍️ Badge` look like different
      // components, so a benign duplicate publish reported as a LOST
      // COMPONENT — the false alarm that trains a reader to skim the section
      // that exists to catch a real loss.
      name: statusParser.extractStatus(meta.name).cleanName || meta.name,
      nodeId: meta.node_id,
      importMethod: importMethod,
      page: (lookup && lookup.cleanPage) || null,
      pageRaw:
        (meta.containing_frame && meta.containing_frame.pageName) || null,
    };
  }
  function entrySide(entry) {
    return {
      name: (entry && entry.name) || null,
      nodeId: (entry && entry.nodeId) || null,
      importMethod: (entry && entry.importMethod) || null,
      page: null,
      pageRaw: (entry && entry.page) || null,
    };
  }

  // Not every collision is a loss, and treating them alike is how a real alarm
  // becomes wallpaper. The first real run (2026-07-13) found TEN, of which only
  // TWO were losses:
  //
  //   LOSS      the two sides are different things, and one of them is now gone
  //             from the design system. `calendar` and `search`: a component SET
  //             ("Calendar", "Search") owns the slug, so the ICON of the same
  //             name is dropped and the DS has no calendar/search glyph at all.
  //
  //   DUPLICATE the same component published twice under one slug — during the
  //             2026-07 icon refactor the masters live on TWO pages, so `add`,
  //             `export`, `snowflake`… collide with themselves. The slug still
  //             resolves to the surviving node, so NOTHING is lost. It is Figma
  //             hygiene, not a data loss, and must not shout like one.
  //
  // Discriminator: same name AND same importMethod => the two nodes are the same
  // component published twice. Anything else means two DIFFERENT components want
  // one slug, and the loser is genuinely gone.
  function collisionSeverity(dropped, kept) {
    var sameName =
      dropped.name != null &&
      kept.name != null &&
      String(dropped.name) === String(kept.name);
    var sameKind =
      dropped.importMethod != null &&
      dropped.importMethod === kept.importMethod;
    return sameName && sameKind ? "duplicate" : "loss";
  }

  // `dropped` is the side that DISAPPEARS from the registry, `kept` is the side
  // that survives — which way round depends on the caller (a standalone loses to
  // an existing entry; an existing entry loses to an overwriting set).
  //
  // droppedPage/droppedPageRaw do two jobs: they tell the reader where to go in
  // Figma, and they let sync-from-figma suppress collisions on pages it drops
  // wholesale anyway (DENIED_PAGES) — those are not lost components, and alarming
  // about them would be a false alarm.
  function collectSlugCollision(slug, dropped, kept, forcedSeverity) {
    var dedupeKey = "collision|" + slug + "|" + dropped.nodeId;
    if (seenComponentWarnings[dedupeKey]) return;
    seenComponentWarnings[dedupeKey] = true;
    componentWarnings.push({
      code: "SLUG_COLLISION_DROPPED",
      severity: forcedSeverity || collisionSeverity(dropped, kept),
      slug: slug,
      droppedName: dropped.name,
      droppedNodeId: dropped.nodeId,
      droppedImportMethod: dropped.importMethod,
      droppedPage: dropped.page,
      droppedPageRaw: dropped.pageRaw,
      keptName: kept.name,
      keptNodeId: kept.nodeId,
      keptImportMethod: kept.importMethod,
    });
  }

  // Component sets
  componentSets.forEach(function (meta) {
    if (isInternalName(meta.name)) return;
    var node = componentSetNodes[meta.node_id];
    var slug = slugify(meta.name);
    var lookup = lookupCategoryEntry(meta);
    collectComponentWarning(lookup, slug);
    if (excludeSet[lookup.cleanPage]) return; // staging / not-ready page
    if (isOnCategoryHeaderPage(lookup)) return;
    // Set-vs-set collision. This loop has no guard — the assignment below simply
    // overwrites — so two sets that slugify alike lose one of themselves just as
    // silently as the standalone case, and it is the SAME bug class. Behaviour is
    // deliberately left as-is (last write wins): flipping the winner would change
    // registry contents, and a tripwire must not quietly rewrite the substrate it
    // is watching. So: same loss, same alarm, zero behaviour change. The node
    // being overwritten is the one that disappears, so it is the "dropped" one.
    if (slug in registry.components) {
      // The EXISTING entry is the one about to vanish under the assignment.
      collectSlugCollision(
        slug,
        entrySide(registry.components[slug]),
        metaSide(meta, lookup, "set"),
      );
    }
    var entry = buildEntry(
      meta,
      node,
      "set",
      lookup.entry,
      slug,
      iconGroupsLookup,
    );
    registry.components[slug] = entry;
  });

  // Standalone components — caller must have already filtered out variants-of-sets.
  standalones.forEach(function (meta) {
    if (isInternalName(meta.name)) return;
    var node = standaloneNodes[meta.node_id];
    var slug = slugify(meta.name);
    var lookup = lookupCategoryEntry(meta);
    collectComponentWarning(lookup, slug);
    // POLICY DROPS FIRST. A component the publish gate or a staging page would
    // have removed anyway is NOT a collision casualty, and reporting it as one
    // would be a false alarm — which is worse than no alarm at all. Only a
    // standalone that would OTHERWISE have been published can be "lost" to a
    // collision, so these two gates must run before the collision check below.
    if (excludeSet[lookup.cleanPage]) return; // staging / not-ready page
    if (isOnCategoryHeaderPage(lookup)) return;

    var entry = buildEntry(
      meta,
      node,
      "single",
      lookup.entry,
      slug,
      iconGroupsLookup,
    );
    // Type is inferable: an icon comes off an Icons page, so the category says so.
    var isIcon = entry.category === "Icons";

    // The icon namespace first. Nothing in `components` can take a slug here, so
    // a `calendar` icon survives even though the `Calendar` component owns
    // `components.calendar`. This is what stops the DS losing glyphs to component
    // names, permanently — no Figma rename required, and no rename required the
    // NEXT time an icon and a component reasonably want the same word.
    if (isIcon) {
      if (slug in registry.icons) {
        // Two icons, one name: the same glyph published from two nodes (the icon
        // masters live on two pages during the 2026-07 refactor). First wins; the
        // slug still resolves, so nothing is lost. Reported as a duplicate.
        collectSlugCollision(
          slug,
          metaSide(meta, lookup, "single"),
          entrySide(registry.icons[slug]),
        );
      } else {
        registry.icons[slug] = entry;
      }
    }

    // Then the flat `components` map, whose behaviour is deliberately UNCHANGED:
    // the component still wins, so no existing consumer key moves and this whole
    // change stays additive. The difference is that the icon is no longer LOST
    // when it loses here — it is already safe in `icons` above.
    if (slug in registry.components) {
      var holder = registry.components[slug];
      var holderIsIcon = holder && holder.category === "Icons";
      // An icon that lost the flat slug to a real component is NOT a loss any
      // more; it is namespaced. Say that, rather than crying wolf: this fires on
      // every sync forever (calendar, search, and whatever collides next), and an
      // alarm that shouts "LOST" about something that is safe is how a real alarm
      // becomes wallpaper.
      if (isIcon && !holderIsIcon) {
        collectSlugCollision(
          slug,
          metaSide(meta, lookup, "single"),
          entrySide(holder),
          "namespaced",
        );
        return;
      }
      // Icon-vs-icon was already reported above as a duplicate — don't double-warn.
      if (!(isIcon && holderIsIcon)) {
        collectSlugCollision(
          slug,
          metaSide(meta, lookup, "single"),
          entrySide(holder),
        );
      }
      return;
    }
    registry.components[slug] = entry;
  });

  // A component that resolved to NO category falls out of everything downstream
  // that keys off category — categories.json, the docs site's page tree, the
  // graph's in_category edges — and it did so in TOTAL SILENCE. assertNoCategoryMassLoss
  // only fires when a whole category is GUTTED (>= 10 members → 0), so exactly one
  // component slipping out is invisible to it.
  //
  // That is what happened to `toggle` (2026-07-13). Its Figma page was renamed
  // `Toggle control` → `Toggle` on the canvas, but the library was not republished,
  // so the LIVE document tree (which drives category inference) said `Toggle` while
  // the PUBLISHED component metadata (which carries each component's page name) still
  // said `Toggle control`. The two never matched, toggle got no category, and the docs
  // site stopped generating a page for it — with nothing anywhere saying so.
  //
  // Guarded on categoryMap: FM Kit and Meta Kit have no page-category structure at all
  // (they never pass documentChildren), so every one of their components is legitimately
  // category-less. Warning there would emit 315 lines of noise and bury the one that matters.
  if (categoryMap) {
    Object.keys(registry.components).forEach(function (slug) {
      var entry = registry.components[slug];
      if (!entry || entry.category != null) return;
      componentWarnings.push({
        code: "COMPONENT_WITHOUT_CATEGORY",
        component: slug,
        name: entry.name,
        page: entry.page,
      });
    });
  }

  if (componentWarnings.length > 0 && typeof input.onWarnings === "function") {
    input.onWarnings(componentWarnings);
  }

  // Canonical emit: components sorted by slug so a re-emitted file is
  // byte-stable and a real diff stays readable. Figma's API iteration order
  // (sets then standalones, each in service order) is arbitrary and made
  // ~97% of breaking-PR registry diffs pure move-noise.
  var sortedComponents = {};
  Object.keys(registry.components)
    .sort()
    .forEach(function (slug) {
      sortedComponents[slug] = registry.components[slug];
    });
  registry.components = sortedComponents;

  registry.componentCount = Object.keys(registry.components).length;

  // ζ.3 (2026-05-13): post-pass — populate nestedComponents.
  //
  // Two signal sources from Figma REST node payloads:
  //   1. INSTANCE_SWAP property defaults (componentPropertyDefinitions):
  //      defaultValue is the component key of the swappable slot's default.
  //      Role = property name with hash-suffix stripped (Figma uses "Icon#15:0"
  //      style identifiers internally).
  //   2. Child INSTANCE nodes recursively walked from doc.children:
  //      componentId is the source component's node id. Captures hardcoded
  //      nesting (non-swappable instances baked into the component frame).
  //
  // Both signals get resolved against same-kit slugs only — cross-kit refs
  // and external library refs return null and are dropped. Deduplication
  // keeps the first occurrence (instance-swap entries listed first since
  // they're authoritatively curated).
  populateNestedComponents(registry, componentSetNodes, standaloneNodes);

  return registry;
}

// Strip Figma's "#NN:NN" hash suffix from property keys: "Icon#15927:0" → "Icon".
function stripPropertyHash(name) {
  var s = String(name || "");
  var hashIdx = s.indexOf("#");
  return hashIdx >= 0 ? s.slice(0, hashIdx) : s;
}

// Recursively walk a Figma node tree and yield every INSTANCE node's
// `componentId`. INSTANCE nodes can nest inside frames, groups, vector
// containers, etc. — descend through any container type.
function collectInstanceComponentIds(node, out) {
  if (!node || typeof node !== "object") return;
  if (node.type === "INSTANCE" && typeof node.componentId === "string") {
    out.push(node.componentId);
  }
  if (Array.isArray(node.children)) {
    for (var i = 0; i < node.children.length; i++) {
      collectInstanceComponentIds(node.children[i], out);
    }
  }
}

function populateNestedComponents(
  registry,
  componentSetNodes,
  standaloneNodes,
) {
  // Build key → slug and nodeId → slug lookup maps.
  var keyToSlug = {};
  var nodeIdToSlug = {};
  Object.keys(registry.components).forEach(function (slug) {
    var e = registry.components[slug];
    if (e.key) keyToSlug[e.key] = slug;
    if (e.nodeId) nodeIdToSlug[e.nodeId] = slug;
  });

  Object.keys(registry.components).forEach(function (slug) {
    var entry = registry.components[slug];
    var node = componentSetNodes[entry.nodeId] || standaloneNodes[entry.nodeId];
    if (!node || !node.document) return;
    var doc = node.document;

    var seen = {};
    var nested = [];

    // Source 1: INSTANCE_SWAP property defaults.
    var defs = doc.componentPropertyDefinitions;
    if (defs && typeof defs === "object") {
      Object.keys(defs).forEach(function (propKey) {
        var def = defs[propKey];
        if (!def || def.type !== "INSTANCE_SWAP") return;
        var targetKey = def.defaultValue;
        if (!targetKey) return;
        var targetSlug = keyToSlug[targetKey];
        if (!targetSlug || targetSlug === slug) return;
        if (seen[targetSlug]) return;
        seen[targetSlug] = true;
        nested.push({
          slug: targetSlug,
          role: stripPropertyHash(propKey),
          source: "instance-swap",
        });
      });
    }

    // Source 2: hardcoded INSTANCE children in the node tree.
    var componentIds = [];
    collectInstanceComponentIds(doc, componentIds);
    componentIds.forEach(function (cid) {
      var targetSlug = nodeIdToSlug[cid];
      if (!targetSlug) {
        // Tier 3 - componentSetId bridge (mirror of the anatomy normalizer): a
        // nested composite instance's componentId is a variant inside a set;
        // resolve through the fetched node's own components dict to the set's
        // registry nodeId. Strict fallback: only when the direct nodeId misses.
        var comps = node.components || {};
        var setId = comps[cid] && comps[cid].componentSetId;
        if (setId) targetSlug = nodeIdToSlug[setId];
      }
      if (!targetSlug || targetSlug === slug) return;
      if (seen[targetSlug]) return;
      seen[targetSlug] = true;
      nested.push({
        slug: targetSlug,
        role: null,
        source: "child-instance",
      });
    });

    if (nested.length > 0) {
      entry.nestedComponents = nested;
    }
  });
}

module.exports = transformRegistry;
module.exports._deriveGroup = deriveGroup;
module.exports._slugify = slugify;
module.exports._splitVariantAndProperties = splitVariantAndProperties;
module.exports._trimDescription = trimDescription;
module.exports._buildEntry = buildEntry;
module.exports._populateNestedComponents = populateNestedComponents;
