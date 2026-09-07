"use strict";

// Turn geometry disagreements into the exact declaration that would settle
// them, and apply them on request.
//
// The oracle next door produces 91 findings. Each one already knows everything
// needed to write the fix: the rule, the property, what we state, what the
// capture measured, and the token the capture bound when it bound one. Leaving
// a person to carry those five facts into a 145,000-character stylesheet by
// hand is where the time goes, and it is also where the typos go.
//
// 🔑 THIS PROPOSES. It does not decide. A disagreement can mean the CSS has the
// shape wrong, that the renderer flattened a structure Figma splits across
// nested frames, or that the Figma component itself is off the spacing scale.
// Only the first is repaired by copying the capture, so proposals are produced
// per slug, printed before they are written, and never applied across the
// corpus in one go.

var SIDES = ["top", "right", "bottom", "left"];

/** The declaration text for a captured fact: the token when there is one. */
function valueFor(px, factToken, tokenMap) {
  if (factToken && tokenMap && tokenMap[factToken] != null) {
    var resolved = parseFloat(String(tokenMap[factToken]));
    // Only bind the token if it actually resolves to the captured number.
    // Binding a token that resolves elsewhere would trade a wrong number for a
    // wrong number that is harder to see.
    if (Number.isFinite(resolved) && Math.abs(resolved - px) <= 0.5)
      return "var(" + factToken + ")";
  }
  return px === 0 ? "0" : px + "px";
}

/**
 * Comments blanked to spaces of the SAME LENGTH, so every offset into the
 * result is an offset into the original.
 *
 * Stripping comments outright is what the oracle does, and it is wrong here:
 * this module computes byte offsets it later writes at. It is also not
 * optional. ds-base.css puts a comment above most rules, so the rule regex
 * folds it into the following rule's captured selector text and
 * `.ds-page-header` never matches `\n/* page header *\/\n.ds-page-header`.
 * That is the same shape as the bug ownedRules carries a warning about.
 */
function maskComments(css) {
  return String(css).replace(/\/\*[\s\S]*?\*\//g, function (m) {
    return " ".repeat(m.length);
  });
}

/**
 * The rule body for an exact selector, plus where it sits.
 * Requires the selector to appear exactly once as a whole rule: an ambiguous
 * anchor is refused rather than guessed at, because a patch that lands on the
 * wrong occurrence is the failure mode that reads as success.
 */
function findRule(css, selector) {
  var masked = maskComments(css);
  var re = /([^{}]+)\{([^{}]*)\}/g;
  var m;
  var hits = [];
  while ((m = re.exec(masked)) !== null) {
    if (m[1].trim() !== selector.trim()) continue;
    // Bodies are read from the ORIGINAL, so a value is never a blanked comment.
    hits.push({
      start: m.index,
      end: re.lastIndex,
      head: m[1],
      body: css.slice(m.index + m[1].length + 1, re.lastIndex - 1),
    });
  }
  if (hits.length !== 1) return { rule: null, count: hits.length };
  return { rule: hits[0], count: 1 };
}

/**
 * Declarations of a rule body, in order, with the offsets of the VALUE.
 *
 * Parsed against a comment-MASKED copy and sliced out of the original, for the
 * reason findRule masks: ds-base.css writes explanatory comments inside rule
 * bodies, and `.ds-page-header`'s says "lg top / xl horizontal / 0 bottom: top
 * gap from the app header". Splitting the raw body on `;` and taking the first
 * `:` reads that comment's colon and the declaration after it disappears, so
 * the repair reported "the rule states neither the side nor the shorthand"
 * about a rule that states the shorthand plainly.
 *
 * The VALUE's offsets, not the declaration's, because that is what a repair
 * replaces. Splicing an exact slice needs no regex over text that may carry a
 * comment, and a regex over that text is how the paragraph above happened.
 */
function declarations(body) {
  var masked = maskComments(body);
  var out = [];
  var offset = 0;
  masked.split(";").forEach(function (chunk) {
    var start = offset;
    offset += chunk.length + 1;
    var i = chunk.indexOf(":");
    if (i < 0) return;
    var prop = chunk.slice(0, i).trim().toLowerCase();
    if (!prop || /[{}]/.test(prop)) return;
    // Trim from the MASKED value so leading/trailing space is skipped
    // identically on both sides, then take the same span out of the original.
    var rawValue = chunk.slice(i + 1);
    var lead = rawValue.length - rawValue.replace(/^\s+/, "").length;
    var trail = rawValue.length - rawValue.replace(/\s+$/, "").length;
    var valueStart = start + i + 1 + lead;
    var valueEnd = start + chunk.length - trail;
    if (valueEnd <= valueStart) return;
    out.push({
      property: prop,
      value: body.slice(valueStart, valueEnd),
      valueStart: valueStart,
      valueEnd: valueEnd,
    });
  });
  return out;
}

function collapsePadding(parts) {
  var t = parts.top,
    r = parts.right,
    b = parts.bottom,
    l = parts.left;
  if (t === r && r === b && b === l) return t;
  if (t === b && l === r) return t + " " + r;
  if (l === r) return t + " " + r + " " + b;
  return t + " " + r + " " + b + " " + l;
}

/**
 * One proposal per DECLARATION to rewrite (not per finding): four padding sides
 * that disagree inside one shorthand are one edit, or the file would be
 * rewritten four times over the same characters.
 *
 * `expand` is the caller's padding expander (geometry-classify.expandPadding),
 * injected rather than imported so this module stays a pure text transformer
 * and the two cannot drift into two different shorthand readings.
 */
function proposals(opts) {
  var css = opts.css;
  var tokenMap = opts.tokenMap || {};
  var expand = opts.expandPadding;
  var out = [];
  var refused = [];

  var bySelector = {};
  (opts.mismatches || []).forEach(function (m) {
    (bySelector[m.selector] = bySelector[m.selector] || []).push(m);
  });

  Object.keys(bySelector)
    .sort()
    .forEach(function (selector) {
      var found = findRule(css, selector);
      if (!found.rule) {
        refused.push({
          selector: selector,
          reason:
            found.count === 0
              ? "no rule with this exact selector"
              : found.count + " rules share this selector, so the anchor is ambiguous",
        });
        return;
      }
      var bodyStart = found.rule.start + found.rule.head.length + 1;
      var decls = declarations(found.rule.body);
      var findings = bySelector[selector];
      var handled = {};

      findings.forEach(function (m) {
        if (handled[m.property]) return;
        var longhand = decls.filter(function (d) {
          return d.property === m.property;
        });
        if (longhand.length) {
          // The LAST one is what paints, and it is what the oracle classified.
          var d = longhand[longhand.length - 1];
          handled[m.property] = true;
          out.push({
            slug: m.slug,
            selector: selector,
            property: m.property,
            from: d.value,
            // The RESOLVED old number(s), not the text. A stale-annotation
            // check reading `var(--zen-spacing-2xs)` for a number finds the 2
            // in "2xs" and misses the 4 the comment beside it states.
            fromPx: [m.painted],
            to: valueFor(m.fact, m.factToken, tokenMap),
            valueStart: bodyStart + d.valueStart,
            valueEnd: bodyStart + d.valueEnd,
          });
          return;
        }

        // A padding side with no longhand: the shorthand is the declaration
        // that paints it, so the whole shorthand is rewritten, keeping the
        // sides that already agree.
        if (m.property.indexOf("padding-") !== 0) {
          refused.push({
            selector: selector,
            reason:
              "the rule states no `" +
              m.property +
              "` of its own, so there is nothing here to rewrite",
          });
          return;
        }
        var shorthand = decls.filter(function (d) {
          return d.property === "padding";
        });
        if (!shorthand.length) {
          refused.push({
            selector: selector,
            reason: "padding disagrees but the rule states neither the side nor the shorthand",
          });
          return;
        }
        var sd = shorthand[shorthand.length - 1];
        var current = expand(sd.value, tokenMap, 0);
        if (!current) {
          refused.push({
            selector: selector,
            reason: "`padding: " + sd.value + "` is not four plain lengths, so it is not rewritten blind",
          });
          return;
        }
        var next = {};
        SIDES.forEach(function (side) {
          var hit = findings.find(function (f) {
            return f.property === "padding-" + side;
          });
          handled["padding-" + side] = true;
          next[side] = hit
            ? valueFor(hit.fact, hit.factToken, tokenMap)
            : valueFor(current[side].px, null, tokenMap);
        });
        // A side that already agreed keeps whatever the source said, so a
        // repair of the left inset does not silently unbind the top's token.
        SIDES.forEach(function (side) {
          var hit = findings.find(function (f) {
            return f.property === "padding-" + side;
          });
          if (!hit && current[side].token)
            next[side] = "var(" + current[side].token + ")";
        });
        handled.padding = true;
        out.push({
          slug: m.slug,
          selector: selector,
          property: "padding",
          from: sd.value,
          fromPx: SIDES.map(function (side) {
            return current[side].px;
          }),
          to: collapsePadding(next),
          valueStart: bodyStart + sd.valueStart,
          valueEnd: bodyStart + sd.valueEnd,
        });
      });
    });

  // Back to front, so applying one edit cannot shift the next one's offsets.
  out.sort(function (a, b) {
    return b.valueStart - a.valueStart;
  });
  return { proposals: out, refused: refused };
}

/**
 * Apply proposals to the stylesheet text, back to front so earlier offsets stay
 * valid.
 *
 * Every edit re-reads the value at its recorded offsets and refuses the whole
 * apply unless it is still the text the proposal was computed from. A patch
 * that lands on shifted offsets writes plausible nonsense and reports success,
 * and a patch whose anchor has moved writes nothing while reporting the same.
 */
function apply(css, list) {
  var out = css;
  var applied = [];
  var staleNotes = [];
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    var actual = out.slice(p.valueStart, p.valueEnd);
    if (actual !== p.from) {
      throw new Error(
        "geometry-repair: the value at the recorded offset is not the one this " +
          "proposal was computed from.\n  expected: " +
          JSON.stringify(p.from) +
          "\n  found:    " +
          JSON.stringify(actual) +
          "\nNothing was written.",
      );
    }
    if (p.to === p.from) {
      throw new Error(
        "geometry-repair: " +
          p.selector +
          " {" +
          p.property +
          "} proposes the value it already has. A no-op edit that reports " +
          "success is worse than a failure.",
      );
    }
    out = out.slice(0, p.valueStart) + p.to + out.slice(p.valueEnd);

    // A trailing annotation that still states the OLD number. ds-base.css
    // writes `gap: var(--zen-spacing-2xs); /* 4 -- crumb/separator gap */`, and
    // rewriting the value alone leaves a comment saying 4 beside a declaration
    // that resolves to 8. A comment contradicting the code it annotates is the
    // exact defect this whole lane keeps finding, so a repair must not create
    // one silently. Reported rather than rewritten: the number in a comment is
    // sometimes the number, and sometimes part of a sentence.
    var lineEnd = out.indexOf("\n", p.valueStart);
    var rest = out.slice(p.valueStart, lineEnd === -1 ? out.length : lineEnd);
    var comment = /\/\*([\s\S]*?)\*\//.exec(rest);
    var oldNumbers = (p.fromPx || []).filter(function (n) {
      return typeof n === "number" && Number.isFinite(n);
    });
    var statesOld =
      comment &&
      oldNumbers.some(function (n) {
        return new RegExp("(?<![\\d.])" + n + "(?![\\d.])").test(comment[1]);
      });
    if (statesOld) {
      staleNotes.push({
        selector: p.selector,
        property: p.property,
        comment: comment[0],
      });
    }
    applied.push(p);
  }
  return { css: out, applied: applied, staleNotes: staleNotes };
}

module.exports = {
  SIDES: SIDES,
  maskComments: maskComments,
  valueFor: valueFor,
  findRule: findRule,
  declarations: declarations,
  collapsePadding: collapsePadding,
  proposals: proposals,
  apply: apply,
};
