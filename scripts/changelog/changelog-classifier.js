"use strict";

// Classifies a sync diff as additive / breaking / unchanged, and emits a
// human-readable Markdown changelog grouped by category.
//
// Used by sync-from-figma.js (Sprint 1) and the GitHub Action workflow:
// additive PRs auto-merge after CI green; breaking PRs require manual review.
//
// Surface:
//   classify({ before, after, fileKind: "registry" | "styles" })
//   → { category: "additive" | "breaking" | "unchanged",
//       changelog: "<markdown>",
//       reasons: ["short reason", …]   // breaking only; empty for additive }

function isRegistryUnchanged(beforeReg, afterReg) {
  // Compare components ignoring lastSynced.
  var bC = beforeReg.components || {};
  var aC = afterReg.components || {};
  var bSlugs = Object.keys(bC).sort();
  var aSlugs = Object.keys(aC).sort();
  if (bSlugs.length !== aSlugs.length) return false;
  if (bSlugs.join("|") !== aSlugs.join("|")) return false;
  for (var i = 0; i < bSlugs.length; i++) {
    var slug = bSlugs[i];
    if (!shallowEqualEntry(bC[slug], aC[slug])) return false;
  }
  return true;
}

function shallowEqualEntry(b, a) {
  if (!b || !a) return b === a;
  // ζ.1 (2026-05-13): per-component `lastSynced` removed from the registry
  // schema entirely (ecosystem audit found zero consumers). Older entries
  // may still have the field on first read after a knowledge-repo upgrade;
  // the field is simply ignored in this comparison — same as the legacy
  // behavior — so the verdict is unaffected.
  //
  // Note on `category` + `status` + `categorySlug`: the first sync after
  // each of these fields was introduced will surface every DS Kit
  // component as "modified" in the changelog because before-entries lack
  // the field entirely while after-entries gain it. The verdict will
  // still classify as "additive" since entryBreakingReasons() doesn't
  // flag these fields. One-time noise; subsequent syncs only diff real
  // changes. Same one-time-noise applies to `documentationLinks` added by
  // ζ.1. (`categorySlug` added 2026-06-01 — it MUST appear in `keys`
  // below, else the sync's write-gate never detects it and the field
  // never reaches disk; that gap stranded categorySlug out of v0.25.7.)
  var keys = [
    "name",
    "key",
    "nodeId",
    "importMethod",
    "description",
    "page",
    "section",
    "category",
    "categorySlug",
    "group",
    "status",
    "guidelinesFile",
  ];
  for (var i = 0; i < keys.length; i++) {
    if (b[keys[i]] !== a[keys[i]]) return false;
  }
  if (JSON.stringify(b.properties || {}) !== JSON.stringify(a.properties || {}))
    return false;
  if (JSON.stringify(b.variants || {}) !== JSON.stringify(a.variants || {}))
    return false;
  if (
    JSON.stringify(b.nestedComponents || []) !==
    JSON.stringify(a.nestedComponents || [])
  )
    return false;
  if (
    JSON.stringify(b.documentationLinks || []) !==
    JSON.stringify(a.documentationLinks || [])
  )
    return false;
  // ζ.5: secondaryGroups (only present on multi-group icons).
  if (
    JSON.stringify(b.secondaryGroups || []) !==
    JSON.stringify(a.secondaryGroups || [])
  )
    return false;
  return true;
}

function diffRegistry(before, after) {
  var bC = before.components || {};
  var aC = after.components || {};
  var bSlugs = Object.keys(bC);
  var aSlugs = Object.keys(aC);

  // Map by key (stable across renames); fall back to slug.
  var bKeyMap = {};
  bSlugs.forEach(function (slug) {
    var e = bC[slug];
    if (e.key) bKeyMap[e.key] = { slug: slug, entry: e };
  });
  var aKeyMap = {};
  aSlugs.forEach(function (slug) {
    var e = aC[slug];
    if (e.key) aKeyMap[e.key] = { slug: slug, entry: e };
  });

  var added = []; // {slug, entry}
  var removed = []; // {slug, entry}
  var renamed = []; // {fromSlug, toSlug, entry}
  var modified = []; // {slug, before, after, breakingReasons: []}

  // Walk old keys → renamed/removed/modified
  Object.keys(bKeyMap).forEach(function (key) {
    if (!aKeyMap[key]) {
      removed.push({ slug: bKeyMap[key].slug, entry: bKeyMap[key].entry });
      return;
    }
    var b = bKeyMap[key].entry;
    var a = aKeyMap[key].entry;
    var fromSlug = bKeyMap[key].slug;
    var toSlug = aKeyMap[key].slug;
    if (fromSlug !== toSlug || b.name !== a.name) {
      renamed.push({
        fromSlug: fromSlug,
        toSlug: toSlug,
        fromName: b.name,
        toName: a.name,
        entry: a,
      });
    }
    var reasons = entryBreakingReasons(b, a);
    if (reasons.length > 0 || !shallowEqualEntry(b, a)) {
      modified.push({
        slug: toSlug,
        before: b,
        after: a,
        breakingReasons: reasons,
      });
    }
  });

  // Walk new keys → added (when no matching old key)
  Object.keys(aKeyMap).forEach(function (key) {
    if (!bKeyMap[key]) {
      added.push({ slug: aKeyMap[key].slug, entry: aKeyMap[key].entry });
    }
  });

  // Entries without a key in either side: fall back to slug
  bSlugs.forEach(function (slug) {
    if (bC[slug].key) return;
    if (!(slug in aC)) removed.push({ slug: slug, entry: bC[slug] });
  });
  aSlugs.forEach(function (slug) {
    if (aC[slug].key) return;
    if (!(slug in bC)) added.push({ slug: slug, entry: aC[slug] });
  });

  return {
    added: added,
    removed: removed,
    renamed: renamed,
    modified: modified,
  };
}

function entryBreakingReasons(b, a) {
  var reasons = [];

  // Variant axes
  var bVar = b.variants || {};
  var aVar = a.variants || {};
  Object.keys(bVar).forEach(function (axis) {
    if (!(axis in aVar)) {
      reasons.push(
        "removed variant axis '" + axis + "' on " + (a.name || b.name),
      );
      return;
    }
    var bVals = bVar[axis] || [];
    var aVals = aVar[axis] || [];
    bVals.forEach(function (v) {
      if (aVals.indexOf(v) === -1) {
        reasons.push(
          "removed variant value '" +
            axis +
            "=" +
            v +
            "' on " +
            (a.name || b.name),
        );
      }
    });
  });

  // Properties
  var bP = b.properties || {};
  var aP = a.properties || {};
  Object.keys(bP).forEach(function (key) {
    if (!(key in aP)) {
      reasons.push("removed property '" + key + "' on " + (a.name || b.name));
      return;
    }
    if (bP[key].type !== aP[key].type) {
      reasons.push(
        "property type change '" +
          key +
          "' " +
          bP[key].type +
          " → " +
          aP[key].type +
          " on " +
          (a.name || b.name),
      );
    }
    if (bP[key].type === aP[key].type) {
      // Compare defaults via JSON.stringify: reference equality (!==) gives
      // false positives on object defaults (Figma INSTANCE_SWAP stores
      // {guid: {…}}). Stringified comparison correctly treats two
      // structurally-equal objects as equal.
      var bDefault = JSON.stringify(bP[key].default);
      var aDefault = JSON.stringify(aP[key].default);
      if (bDefault !== aDefault) {
        reasons.push(
          "property default change '" +
            key +
            "' " +
            bDefault +
            " → " +
            aDefault +
            " on " +
            (a.name || b.name),
        );
      }
    }
  });

  return reasons;
}

// Returns human-readable additive notes for a modified entry — new variant
// axes/values, new properties. Used to flesh out the changelog beyond just
// breaking reasons.
function entryAdditiveNotes(b, a) {
  var notes = [];

  var bVar = b.variants || {};
  var aVar = a.variants || {};
  Object.keys(aVar).forEach(function (axis) {
    if (!(axis in bVar)) {
      notes.push(
        "added variant axis '" +
          axis +
          "' = [" +
          (aVar[axis] || []).join(", ") +
          "]",
      );
      return;
    }
    var bVals = bVar[axis] || [];
    var aVals = aVar[axis] || [];
    aVals.forEach(function (v) {
      if (bVals.indexOf(v) === -1) {
        notes.push("added variant value '" + axis + "=" + v + "'");
      }
    });
  });

  var bP = b.properties || {};
  var aP = a.properties || {};
  Object.keys(aP).forEach(function (key) {
    if (!(key in bP)) {
      notes.push("added property '" + key + "' (" + aP[key].type + ")");
    }
  });

  return notes;
}

function buildRegistryChangelog(diff) {
  var lines = [];
  if (diff.added.length > 0) {
    lines.push("## Added (" + diff.added.length + ")");
    diff.added.forEach(function (e) {
      lines.push(
        "- " +
          e.entry.name +
          " (`" +
          e.slug +
          "`, importMethod=" +
          e.entry.importMethod +
          ")",
      );
    });
    lines.push("");
  }
  if (diff.renamed.length > 0) {
    lines.push("## Renamed (" + diff.renamed.length + ")");
    diff.renamed.forEach(function (e) {
      lines.push(
        "- " +
          e.fromName +
          " → " +
          e.toName +
          " (slug `" +
          e.fromSlug +
          "` → `" +
          e.toSlug +
          "`)",
      );
    });
    lines.push("");
  }
  if (diff.removed.length > 0) {
    lines.push("## Removed (" + diff.removed.length + ")");
    diff.removed.forEach(function (e) {
      lines.push("- " + e.entry.name + " (`" + e.slug + "`)");
    });
    lines.push("");
  }
  if (diff.modified.length > 0) {
    lines.push("## Modified (" + diff.modified.length + ")");
    diff.modified.forEach(function (e) {
      lines.push(
        "- " + (e.after.name || e.before.name) + " (`" + e.slug + "`)",
      );
      e.breakingReasons.forEach(function (r) {
        lines.push("  - ⚠ " + r);
      });
      var additive = entryAdditiveNotes(e.before, e.after);
      additive.forEach(function (n) {
        lines.push("  - + " + n);
      });
    });
    lines.push("");
  }
  return lines.join("\n");
}

// A reported rename cannot break a consumer when the slug did not change. The
// differ reports a rename when the slug OR the display name changes, so editing
// a status emoji in a component's name used to push the verdict to breaking on
// its own and stall a night's sync (knowledge #512). No consumer addresses a
// component by display name, so resolution is untouched.
//
// A slug change is breaking only when the old slug stops resolving.
// components/dist/identity.json is what makes it resolve, and `absorbedRenames`
// is that fact for the rename THIS RUN is about to record: `{fromSlug: toSlug}`,
// derived from the ledger the run has just rebuilt from its own `after`
// registries, before any verdict is taken (#552).
//
// It cannot come from the COMMITTED ledger, and that is a deadlock rather than
// an oversight: the ledger is derived in a later step than the classify, and a
// breaking verdict opens no PR, so the regenerated ledger is discarded with the
// runner and the next night re-detects the identical rename. Hence
// compute-then-classify in syncRegistry.
//
// 🪤 Checked BY TARGET, not by presence. A ledger that maps the old slug to some
// OTHER component means the old slug resolves to the wrong thing, which is a
// real break; accepting mere presence would launder it into an auto-merge.
function renameBreaksResolution(rename, absorbedRenames) {
  if (rename.fromSlug === rename.toSlug) return false;
  var absorbed = absorbedRenames || {};
  return (
    Object.prototype.hasOwnProperty.call(absorbed, rename.fromSlug) !== true ||
    absorbed[rename.fromSlug] !== rename.toSlug
  );
}

function classifyRegistry(before, after, absorbedRenames) {
  if (isRegistryUnchanged(before, after)) {
    return {
      category: "unchanged",
      changelog: "_No registry changes._",
      reasons: [],
    };
  }
  var diff = diffRegistry(before, after);
  var reasons = [];
  diff.removed.forEach(function (e) {
    reasons.push("removed component '" + (e.entry.name || e.slug) + "'");
  });
  diff.renamed.forEach(function (e) {
    if (!renameBreaksResolution(e, absorbedRenames)) return;
    reasons.push("renamed component '" + e.fromName + "' → '" + e.toName + "'");
  });
  diff.modified.forEach(function (e) {
    reasons.push.apply(reasons, e.breakingReasons);
  });
  var category = reasons.length > 0 ? "breaking" : "additive";
  var changelog = buildRegistryChangelog(diff);
  return { category: category, changelog: changelog, reasons: reasons };
}

// ---------- Styles kind ----------

function stylesIdent(s) {
  // Compare by key when present; fall back to name.
  return s.key || s.name;
}

function diffStylesArr(beforeArr, afterArr) {
  var bMap = {},
    aMap = {};
  (beforeArr || []).forEach(function (s) {
    bMap[stylesIdent(s)] = s;
  });
  (afterArr || []).forEach(function (s) {
    aMap[stylesIdent(s)] = s;
  });

  var added = [],
    removed = [],
    modified = [];
  Object.keys(bMap).forEach(function (id) {
    if (!aMap[id]) {
      removed.push(bMap[id]);
      return;
    }
    if (JSON.stringify(bMap[id]) !== JSON.stringify(aMap[id])) {
      modified.push({ before: bMap[id], after: aMap[id] });
    }
  });
  Object.keys(aMap).forEach(function (id) {
    if (!bMap[id]) added.push(aMap[id]);
  });
  return { added: added, removed: removed, modified: modified };
}

function classifyStyles(before, after) {
  var t = diffStylesArr(before.textStyles, after.textStyles);
  var e = diffStylesArr(before.effectStyles, after.effectStyles);
  var added = t.added.length + e.added.length;
  var removed = t.removed.length + e.removed.length;
  var modified = t.modified.length + e.modified.length;
  if (added === 0 && removed === 0 && modified === 0) {
    return {
      category: "unchanged",
      changelog: "_No style changes._",
      reasons: [],
    };
  }
  var reasons = [];
  t.removed.concat(e.removed).forEach(function (s) {
    reasons.push("removed style '" + s.name + "'");
  });
  t.modified.concat(e.modified).forEach(function (m) {
    reasons.push("changed style '" + m.after.name + "'");
  });
  var category = reasons.length > 0 ? "breaking" : "additive";

  var lines = [];
  if (t.added.length + e.added.length > 0) {
    lines.push("## Added styles (" + (t.added.length + e.added.length) + ")");
    t.added.forEach(function (s) {
      lines.push("- text: " + s.name);
    });
    e.added.forEach(function (s) {
      lines.push("- effect: " + s.name);
    });
    lines.push("");
  }
  if (t.modified.length + e.modified.length > 0) {
    lines.push(
      "## Modified styles (" + (t.modified.length + e.modified.length) + ")",
    );
    t.modified.forEach(function (m) {
      lines.push("- text: " + m.after.name);
    });
    e.modified.forEach(function (m) {
      lines.push("- effect: " + m.after.name);
    });
    lines.push("");
  }
  if (t.removed.length + e.removed.length > 0) {
    lines.push(
      "## Removed styles (" + (t.removed.length + e.removed.length) + ")",
    );
    t.removed.forEach(function (s) {
      lines.push("- text: " + s.name);
    });
    e.removed.forEach(function (s) {
      lines.push("- effect: " + s.name);
    });
    lines.push("");
  }
  return { category: category, changelog: lines.join("\n"), reasons: reasons };
}

// ---------- Icons kind ----------
//
// Diffs the DERIVED icon set (components/dist/icons/icons.json), which is what
// consumers actually resolve glyphs from, not the raw Figma export.
//
// The gate that matters: an icon that WAS clean and is now gone. Consumers
// (plugin renderers, docs) resolve that slug to nothing and render an empty
// box, so it is a breaking change for them.
//
// This phase previously had no diff at all. Its verdict was
// `iconsWrote ? "additive" : "unchanged"`. When the Figma icon rework made 28
// glyphs stop rendering, the sync called the loss "additive", auto-merged, and
// shipped it (syncs #365 + #378). The degraded worklist was printed in the PR
// body and nobody read it, because additive PRs auto-merge.
//
// Deliberately NOT breaking:
//   - a redrawn glyph (same slug, new body): still resolves, nothing breaks
//   - a NEW icon that lands degraded: never resolved before, so nothing regressed
function iconSlugs(side) {
  return Object.keys((side && side.icons) || {});
}

function classifyIcons(before, after, degraded) {
  var b = iconSlugs(before);
  var a = iconSlugs(after);
  var aSet = {};
  a.forEach(function (s) {
    aSet[s] = true;
  });
  var bSet = {};
  b.forEach(function (s) {
    bSet[s] = true;
  });

  // Why each icon dropped out, so the changelog explains itself.
  var reasonBySlug = {};
  (degraded || []).forEach(function (d) {
    if (d && d.slug) reasonBySlug[d.slug] = d.reason || "unknown";
  });

  var lost = b.filter(function (s) {
    return !aSet[s];
  });
  var gained = a.filter(function (s) {
    return !bSet[s];
  });

  // "Redrawn" means the GLYPH changed. Compare only the drawing (viewBox +
  // body), not the whole entry: an icon record also carries nodeId / group /
  // dsKey, and a Figma re-parent or a group rename would otherwise be reported
  // to a human as "this icon was redrawn", which is false.
  var bodyChanged = b.filter(function (s) {
    if (!aSet[s]) return false;
    var bi = before.icons[s] || {};
    var ai = after.icons[s] || {};
    return bi.viewBox !== ai.viewBox || bi.body !== ai.body;
  });

  if (lost.length === 0 && gained.length === 0 && bodyChanged.length === 0) {
    return {
      category: "unchanged",
      changelog: "_No icon changes._",
      reasons: [],
    };
  }

  var reasons = lost.map(function (s) {
    var why = reasonBySlug[s];
    return (
      "lost icon '" +
      s +
      "'" +
      (why ? " (" + why + ")" : " (no longer exported)")
    );
  });

  // A ghost (node-missing) is a STALE REGISTRY, not a bad glyph: Figma's
  // published-library endpoint still advertises a component whose canvas node
  // was deleted. Call it out separately so it is not misread as a drawing
  // problem, and so the fix ("retire it, or restore it in Figma") is obvious.
  var ghosts = lost.filter(function (s) {
    return reasonBySlug[s] === "node-missing";
  });
  var badGlyphs = lost.filter(function (s) {
    return reasonBySlug[s] !== "node-missing";
  });

  var lines = [];
  if (ghosts.length > 0) {
    lines.push(
      "## Stale registry: ghost components (" + ghosts.length + "): BREAKING",
    );
    lines.push("");
    lines.push(
      "Figma's published-library endpoint still advertises these components, but",
    );
    lines.push(
      "their canvas nodes no longer exist, so they now render as nothing. The",
    );
    lines.push(
      "registry entry COUNT does not change when this happens, which is exactly why",
    );
    lines.push("a registry diff cannot catch it.");
    lines.push("");
    lines.push(
      "Each one is either an intentional deletion (retire it in every consumer) or",
    );
    lines.push("collateral damage from a rework (restore it in Figma).");
    lines.push("");
    ghosts.forEach(function (s) {
      lines.push("- `" + s + "` (node no longer exists in Figma)");
    });
    lines.push("");
  }
  if (badGlyphs.length > 0) {
    lines.push("## Lost icons (" + badGlyphs.length + "): BREAKING");
    lines.push("");
    lines.push(
      "These slugs resolved to a glyph before this sync and now resolve to nothing.",
    );
    lines.push(
      "Consumers render an empty box. Fix the glyph in Figma, or add a curated",
    );
    lines.push("override in `components/src/icons-svg.json`.");
    lines.push("");
    badGlyphs.forEach(function (s) {
      var why = reasonBySlug[s];
      lines.push("- `" + s + "`" + (why ? " (" + why + ")" : ""));
    });
    lines.push("");
  }
  if (gained.length > 0) {
    lines.push("## New icons (" + gained.length + ")");
    lines.push("");
    gained.forEach(function (s) {
      lines.push("- `" + s + "`");
    });
    lines.push("");
  }
  if (bodyChanged.length > 0) {
    lines.push("## Redrawn icons (" + bodyChanged.length + ")");
    lines.push("");
    bodyChanged.forEach(function (s) {
      lines.push("- `" + s + "`");
    });
    lines.push("");
  }

  return {
    category: reasons.length > 0 ? "breaking" : "additive",
    changelog: lines.join("\n"),
    reasons: reasons,
  };
}

// ---------- Media kind ----------
//
// Diffs components/dist/media/_index.json, the sidecar consumers actually
// resolve imagery through (docs pages, plugin previews). Diffing HERE catches
// loss from ANY upstream media phase: a prune in media-preview, a vanished
// default capture, a whole slug disappearing. They all surface as the read
// surface losing an entry.
//
// This phase used to have no diff at all. Its verdict was
// `r.wrote ? "additive" : "unchanged"`, and buildMediaIndex is a pure directory
// listing with no memory, so 60 slugs dropping out and 60 slugs appearing were
// indistinguishable. A prune-only night reported "byte-level maintenance writes
// only" on a pull request that had deleted images, and auto-merged. Same shape
// as the icons bug that shipped 29 dead glyphs.
// Count the FRAMES in each role, not just the role name. A role's value is
// either a single path (preview, default) or an ARRAY of paths (parts,
// variations, spacing, behavior, layout).
//
// Keying on the role NAME alone would miss the loss that actually happens.
// pruneStaleCaptures deletes every `<role>-<n>.webp` where n >= the new count,
// and its mass-prune guard explicitly exempts shrinks. So a Variations board
// going from 8 frames to 1 deletes 7 images while the role key survives, and a
// name-only diff sees nothing at all. That is the common, unguarded case; a role
// vanishing entirely is the rare, already-guarded one.
function mediaCounts(side) {
  var out = {};
  var m = (side && side.media) || {};
  Object.keys(m).forEach(function (slug) {
    var roles = {};
    Object.keys(m[slug] || {}).forEach(function (role) {
      var v = m[slug][role];
      roles[role] = Array.isArray(v) ? v.length : 1;
    });
    out[slug] = roles;
  });
  return out;
}

function classifyMedia(before, after, opts) {
  opts = opts || {};
  var b = mediaCounts(before);
  var a = mediaCounts(after);

  // The prior index could not be read, so loss cannot be ruled out. Say so and
  // demand review rather than guessing, and rather than bricking the pipeline.
  if (opts.beforeUnparseable) {
    return {
      category: "breaking",
      changelog:
        "## Media index unreadable: BREAKING\n\n" +
        "The previous `media/_index.json` could not be parsed, so this sync cannot\n" +
        "tell whether any imagery was lost. The index has been rewritten from the\n" +
        "media tree (self-healing), but a human needs to confirm nothing vanished.",
      reasons: ["prior media index unreadable, loss cannot be ruled out"],
    };
  }

  var lostSlugs = Object.keys(b).filter(function (s) {
    return !a[s];
  });
  var gainedSlugs = Object.keys(a).filter(function (s) {
    return !b[s];
  });
  // A slug that survives can still LOSE imagery: a role disappearing entirely,
  // or a role keeping its name while shedding frames. Both vanish from the page.
  var lostRoles = [];
  var gainedFrames = 0;
  Object.keys(b).forEach(function (s) {
    if (!a[s]) return;
    Object.keys(b[s]).forEach(function (role) {
      var had = b[s][role];
      var has = Object.prototype.hasOwnProperty.call(a[s], role)
        ? a[s][role]
        : 0;
      if (has === 0) {
        lostRoles.push(s + ":" + role);
      } else if (has < had) {
        lostRoles.push(s + ":" + role + " (" + had + " -> " + has + " frames)");
      } else if (has > had) {
        gainedFrames++;
      }
    });
    // A role appearing on an existing slug is new imagery, not a loss.
    Object.keys(a[s]).forEach(function (role) {
      if (!Object.prototype.hasOwnProperty.call(b[s], role)) gainedFrames++;
    });
  });

  if (
    lostSlugs.length === 0 &&
    gainedSlugs.length === 0 &&
    lostRoles.length === 0 &&
    gainedFrames === 0
  ) {
    return {
      category: "unchanged",
      changelog: "_No media entries added or removed._",
      reasons: [],
    };
  }

  var reasons = lostSlugs
    .map(function (s) {
      return "lost all media for '" + s + "'";
    })
    .concat(
      lostRoles.map(function (sr) {
        return "lost media role '" + sr + "'";
      }),
    );

  var lines = [];
  if (lostSlugs.length > 0 || lostRoles.length > 0) {
    lines.push(
      "## Lost media (" + (lostSlugs.length + lostRoles.length) + "): BREAKING",
    );
    lines.push("");
    lines.push(
      "Imagery that consumers resolved before this sync no longer resolves.",
    );
    lines.push("Docs pages and plugin previews lose these images.");
    lines.push("");
    lostSlugs.forEach(function (s) {
      lines.push("- `" + s + "` (all roles)");
    });
    lostRoles.forEach(function (sr) {
      lines.push("- `" + sr + "`");
    });
    lines.push("");
  }
  if (gainedSlugs.length > 0 || gainedFrames > 0) {
    lines.push("## New media (" + (gainedSlugs.length + gainedFrames) + ")");
    lines.push("");
    gainedSlugs.forEach(function (s) {
      lines.push("- `" + s + "`");
    });
    lines.push("");
  }

  return {
    category: reasons.length > 0 ? "breaking" : "additive",
    changelog: lines.join("\n"),
    reasons: reasons,
  };
}

function classify(input) {
  var fileKind = input.fileKind;
  if (fileKind === "registry")
    return classifyRegistry(input.before, input.after, input.absorbedRenames);
  if (fileKind === "styles") return classifyStyles(input.before, input.after);
  if (fileKind === "icons")
    return classifyIcons(input.before, input.after, input.degraded);
  if (fileKind === "media")
    return classifyMedia(input.before, input.after, input);
  throw new Error("changelog-classifier: unknown fileKind '" + fileKind + "'");
}

module.exports = classify;
module.exports._diffRegistry = diffRegistry;
module.exports._diffStylesArr = diffStylesArr;
module.exports._classifyIcons = classifyIcons;
module.exports._classifyMedia = classifyMedia;
