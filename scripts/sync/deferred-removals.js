"use strict";

// Deferred registry removals.
//
// A breaking sync commits nothing (#519) and `aggregateVerdict` is
// any-breaking-is-breaking, so ONE component mid-rework in Figma freezes the
// whole pipeline. On 2026-08-13 that cost five nights and 241 icon updates,
// because the Card family was being decomposed and its content set was
// unpublished halfway through (#526).
//
// A deferral carries the entry FORWARD into `after` rather than suppressing the
// verdict, so there is no removal left to classify and the classifier needs no
// knowledge of any of this. The carried entry is marked, so the registry keeps
// meaning "what the library publishes, and what is on borrowed time", rather
// than quietly claiming Figma still publishes something it does not.

// A deferral for another kit is not this kit's business, but a deferral for NO
// known kit is a typo that would otherwise vanish: no error, no log line, no
// changelog entry, and a night that breaks with nothing explaining why the
// deferral did nothing.
function partitionByKit(deferrals, kitId, knownKits) {
  var mine = [];
  var unknownKit = [];
  (deferrals || []).forEach(function (d) {
    if (!d) return;
    if (d.kit === kitId) {
      mine.push(d);
      return;
    }
    if (knownKits && knownKits.indexOf(d.kit) === -1) unknownKit.push(d);
  });
  return { mine: mine, unknownKit: unknownKit };
}

// A real date, not merely a date-shaped string. `Date.UTC` rolls 2026-02-31 over
// to March 3 without complaint, so the deferral would expire on a day nobody
// authored. Round-trip and compare back.
function isRealDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ""))) return false;
  var parts = String(v).split("-").map(Number);
  var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return (
    d.getUTCFullYear() === parts[0] &&
    d.getUTCMonth() === parts[1] - 1 &&
    d.getUTCDate() === parts[2]
  );
}

// The key survives under a DIFFERENT slug in `after`: that is a rename, not a
// removal. Reinstating would leave two slugs sharing one Figma key, and
// derive-identity.buildIdentity is keyed by key, so one of them would silently
// lose its ledger entry to last-writer-wins.
function renamedTo(after, key) {
  var a = (after && after.components) || {};
  var hit = null;
  Object.keys(a).forEach(function (slug) {
    if (key && a[slug] && a[slug].key === key) hit = slug;
  });
  return hit;
}

function isBeingRemoved(before, after, slug) {
  var b = (before && before.components) || {};
  var a = (after && after.components) || {};
  return (
    Object.prototype.hasOwnProperty.call(b, slug) &&
    !Object.prototype.hasOwnProperty.call(a, slug)
  );
}

// Whole days between two ISO instants, compared as DATES rather than instants,
// so `review_by` means "to the end of that day" and a run at 07:00 UTC on the
// review date is still inside the deferral.
function daysBetweenDates(fromIso, toIso) {
  var a = Date.UTC.apply(
    null,
    fromIso
      .slice(0, 10)
      .split("-")
      .map(Number)
      .map(function (n, i) {
        return i === 1 ? n - 1 : n;
      }),
  );
  var b = Date.UTC.apply(
    null,
    toIso
      .slice(0, 10)
      .split("-")
      .map(Number)
      .map(function (n, i) {
        return i === 1 ? n - 1 : n;
      }),
  );
  return Math.round((b - a) / 86400000);
}

function resolve(opts) {
  var apply = [];
  var expired = [];
  var errors = [];
  var split = partitionByKit(opts.deferrals, opts.kitId, opts.knownKits);
  split.unknownKit.forEach(function (d) {
    errors.push(
      "deferral for '" +
        d.slug +
        "' names kit '" +
        d.kit +
        "', which is not a known kit. Expected one of: " +
        (opts.knownKits || []).join(", ") +
        ".",
    );
  });
  split.mine.forEach(function (d) {
    // Dead config is an error, not a no-op. A deferral whose removal has already
    // been carried through would otherwise sit here waiting to wave through some
    // FUTURE removal of the same slug, which is the silent-success shape this
    // repo keeps getting caught by. Self-retiring: delete the entry once the
    // removal lands, exactly as category-page-overrides.json says of its own.
    if (!isBeingRemoved(opts.before, opts.after, d.slug)) {
      errors.push(
        "deferral for '" +
          d.slug +
          "' has no subject: that slug is not being removed by this run. " +
          "If the removal already landed, delete the entry.",
      );
      return;
    }
    // Identity, not name. A slug is a label and can be freed and reused, so a
    // deferral keyed by slug alone could carry forward a DIFFERENT component
    // that happens to have inherited the name.
    var wasKey = (opts.before.components[d.slug] || {}).key;
    if (!d.key || !wasKey) {
      errors.push(
        "deferral for '" +
          d.slug +
          "' must name the Figma `key`, and the registry entry must have one. " +
          "Without it a freed-and-reused slug could carry forward the wrong component.",
      );
      return;
    }
    if (d.key !== wasKey) {
      errors.push(
        "deferral for '" +
          d.slug +
          "' names key '" +
          d.key +
          "' but the registry entry has '" +
          wasKey +
          "'. Refusing to carry forward a component the deferral does not identify.",
      );
      return;
    }
    // Every deferral must carry WHY, WHERE the conversation lives, and WHEN it
    // stops. A deferral without all three is a decision with nobody's name on it.
    var missing = [];
    if (!d.reason || !String(d.reason).trim()) missing.push("reason");
    if (d.issue == null || d.issue === "") missing.push("issue");
    if (!isRealDate(d.review_by)) {
      missing.push("review_by (a real ISO date, YYYY-MM-DD)");
    }
    if (missing.length) {
      errors.push(
        "deferral for '" + d.slug + "' is missing: " + missing.join(", ") + ".",
      );
      return;
    }
    var newSlug = renamedTo(opts.after, d.key);
    if (newSlug) {
      errors.push(
        "deferral for '" +
          d.slug +
          "' is a RENAME to '" +
          newSlug +
          "', not a removal: the same Figma key is published under the new slug. " +
          "Deferrals cover removals only. Carry the rename through instead.",
      );
      return;
    }
    var past = daysBetweenDates(d.review_by, opts.now);
    if (past > 0) {
      expired.push({ slug: d.slug, deferral: d, daysPast: past });
      return;
    }
    apply.push({ slug: d.slug, deferral: d });
  });
  return { apply: apply, expired: expired, errors: errors };
}

// Carry each deferred entry forward verbatim, plus the marker. Verbatim matters:
// the entry must be byte-stable across nights or the sync churns.
function reinstate(before, after, apply) {
  if (!apply || apply.length === 0) return after;
  var next = Object.assign({}, after);
  next.components = Object.assign({}, after.components);
  apply.forEach(function (a) {
    var carried = Object.assign({}, before.components[a.slug]);
    // Deliberately NOT written into `status`. That field is an enum sourced from
    // the Figma page emoji (in-progress / warn / deprecated), so it says what
    // FIGMA thinks of the component. A deferral is a fact about the substrate's
    // handling of it. Writing one into the other conflates two sources and would
    // clobber a real Figma status where the entry has one. The presence of this
    // block is the marker, and it is unambiguous on its own.
    carried.deferral = {
      reason: a.deferral.reason,
      issue: a.deferral.issue,
      review_by: a.deferral.review_by,
    };
    next.components[a.slug] = carried;
  });
  // Recompute, exactly as excludeDeniedPages does when it drops entries. A count
  // that disagrees with the file it describes has shipped from this script
  // before (v0.34.54); this is the same defect from the other direction.
  if (typeof next.componentCount === "number") {
    next.componentCount = Object.keys(next.components).length;
  }
  return next;
}

module.exports = { resolve: resolve, reinstate: reinstate };
