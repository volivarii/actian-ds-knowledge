"use strict";

// derive-canonical.js — derive the canonical render dist + Custom Elements
// Manifest from the assets knowledge owns: the renderer, its stylesheets, and
// the component registries.
//
// Renderer-relocation phase 3 severed the last read of the frozen seed renders
// that used to live in components/render/src/. The slug list and each card's
// group now come from the renderer's own matrix, the stylesheet from the
// relocated styling assets, and every fragment from deriveFragment.
//
// deriveCanonical() takes no argument and returns
// { css, fontsCss, pageCss, fragments, cem, manifest }:
//   css: the shared component stylesheet, concat(tokens.css, ds-base.css) in the
//     order the render read path uses. Carries NO font payload.
//   fontsCss: the embedded faces (ds-fonts.css verbatim), emitted separately as
//     render-fonts.css. A caller building standalone offline files inlines this
//     alongside css; one with its own font pipeline takes css alone.
//   pageCss: the standalone-preview page chrome build-bundle's @dsCard
//     projection re-adds around a fragment (see PAGE_CSS).
//   fragments: { slug: html }, each slug's markup from the relocated renderer
//     (deriveFragment), no <style>, except a TEMPLATES[slug] override.
//   cem: a Custom Elements Manifest (validated against the official schema).
//   manifest: the render index (validated against schemas/canonical-render.json).

var fs = require("node:fs");
var path = require("node:path");
var Ajv = require("ajv");

var CEM_SCHEMA = require(
  path.resolve(
    __dirname,
    "..",
    "..",
    "components",
    "render",
    "schema",
    "custom-elements-manifest.schema.json",
  ),
);

var TEMPLATES = require("./templates/index.js").TEMPLATES;
var readAppearance = require("./derive-appearance.js").readAppearance;
var loadTokenMap = require("./derive-appearance.js").loadTokenMap;
var deriveFragment = require("./derive-from-renderer.js").deriveFragment;
var matrix = require("../../components/render/renderer/matrix.js");
var RENDER_SLUGS = matrix.RENDER_SLUGS;
var groupFor = matrix.groupFor;

// 1.1.0: the envelope gained `fontsCss`. Additive, so a consumer reading 1.0.0
// keeps working; the bump is what lets one DETECT the new artifact instead of
// probing for a file.
var MANIFEST_SCHEMA_VERSION = "1.2.0";
var CEM_SCHEMA_VERSION = "1.0.0";
var DIST_DIR_REL = "components/render/dist";
var REPO_ROOT = path.resolve(__dirname, "..", "..");
var ANATOMY_DIR = path.join(REPO_ROOT, "components", "dist", "anatomy");

// The standalone-preview page chrome. build-bundle's @dsCard projection needs it,
// and slice 1b moved ownership here so build-bundle would stop keeping a copy that
// could drift. It came from the capture harness's second <style> block and was
// guarded identical across all 35 seeds until they retired at phase 3, where it
// was measured once more (35 of 35 identical) and lifted to this constant.
// It is page framing, not part of any component's contract, so render.css excludes it.
var PAGE_CSS = "body{margin:0;padding:24px;background:#fff}";

// Per-component CEM contract. Slice 1 hand-authors Button; slice 2 derives this
// from the appearance + registry facts. cssSelector names the base class prefix
// whose rules define the component's real token surface (scraped for
// cssProperties). tagName follows zen-<slug>, the engineering web components'
// custom-element naming.
var COMPONENT_META = {
  button: {
    tagName: "zen-button",
    className: "ZenButton",
    cssSelector: "ds-button",
    description:
      "Actian Product Design System Button. Taxonomy is Intent x Emphasis: Intent adds Critical; Emphasis is Filled, Outlined, or Ghost.",
    attributes: [
      {
        name: "intent",
        type: { text: "'default' | 'critical'" },
        default: "default",
        description: "Semantic intent. Critical marks a destructive action.",
      },
      {
        name: "emphasis",
        type: { text: "'filled' | 'outlined' | 'ghost'" },
        default: "filled",
        description:
          "Visual emphasis. Filled is the primary treatment, Outlined the secondary, Ghost the least prominent.",
      },
      {
        name: "size",
        type: { text: "'medium' | 'small'" },
        default: "medium",
        description: "Control height. Small is the compact density.",
      },
      {
        name: "disabled",
        type: { text: "boolean" },
        default: "false",
        description: "Whether the button is non-interactive.",
      },
    ],
    slots: [{ name: "", description: "The button's label content." }],
    cssParts: [
      { name: "label", description: "The button's text label." },
      { name: "icon", description: "A leading or trailing icon wrapper." },
    ],
  },
};

// Strip CSS and HTML comments. Comments must go BEFORE any token or rule scan:
// a comment that names a token (or another component's class) would otherwise be
// read as a real reference or selector (e.g. a "/* Reuses .ds-button */" comment
// on an unrelated rule would mis-attribute that rule's tokens to the button).
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
}

// Distinct --zen-* custom properties REFERENCED via var(...) anywhere in the text.
function referencedVars(text) {
  var set = new Set();
  var re = /var\(\s*(--zen-[a-z0-9-]+)/gi;
  var m;
  var scan = stripComments(text);
  while ((m = re.exec(scan)) !== null) set.add(m[1]);
  return set;
}

// Distinct --zen-* custom properties DEFINED (as `--zen-x: value;`) in the style.
function definedVars(styleText) {
  var set = new Set();
  var re = /(--zen-[a-z0-9-]+)\s*:/gi;
  var m;
  var scan = stripComments(styleText);
  while ((m = re.exec(scan)) !== null) set.add(m[1]);
  return set;
}

// The --zen-* tokens the component's OWN rules consume: scan flat CSS rule blocks
// (selector { body }) and keep var() refs from blocks whose selector targets the
// component's class token (.ds-button, .ds-button--primary, .ds-button__icon, a
// descendant .ds-button, ...) but NOT a substring in a comment or an unrelated
// name. This is the component's real token surface, not the whole inlined
// stylesheet. ds-base rules are flat, so a non-nested scan is exact here.
function consumedVars(styleText, cssSelector) {
  var set = new Set();
  // `.ds-button` as a class token: the dot-prefixed name not followed by
  // another name char, so `.ds-button--primary`/`__icon`/`[disabled]` match
  // but `.ds-buttonish` does not. A single following hyphen is ALSO rejected
  // (the second lookahead), because that is a separate compound-name block
  // like `.ds-loader-with-logo`, not a modifier of `.ds-loader` -- without it
  // `.ds-loader` absorbed `.ds-loader-with-logo`'s tokens. The BEM `--`
  // modifier and `__` element forms still match, since two hyphens (or an
  // underscore) fail the "single hyphen" lookahead.
  var selRe = new RegExp("\\." + cssSelector + "(?![a-z0-9])(?!-(?!-))");
  var re = /([^{}]+)\{([^{}]*)\}/g;
  var m;
  while ((m = re.exec(styleText)) !== null) {
    var selector = m[1];
    if (!selRe.test(selector)) continue;
    var body = m[2];
    var vre = /var\(\s*(--zen-[a-z0-9-]+)/gi;
    var vm;
    while ((vm = vre.exec(body)) !== null) set.add(vm[1]);
  }
  return Array.from(set).sort();
}

// Read + merge the component registries (ds -> meta -> fm). Slugs not hand-
// authored in COMPONENT_META fall back to these facts: variants become
// attributes, description is passed through. Missing/unreadable registry
// files are tolerated (merged stays partial) so a derive never throws on a
// registry-plumbing problem, only on a genuinely missing CEM contract.
// FIRST hit wins (a slug's first-seen kit is authoritative), mirroring the
// plugin's ds-first findComponent. This matters for the few render slugs
// (calendar, search, table) that also exist as empty-variant stand-ins in
// fmkit: dskit carries their real variant axes, so a later, emptier kit must
// not clobber them into a zero-attribute CEM.
function readRegistries() {
  var dir = path.join(REPO_ROOT, "components", "dist", "registries");
  var merged = {};
  ["dskit.json", "metakit.json", "fmkit.json"].forEach(function (f) {
    try {
      var reg = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      var comps = reg.components || {};
      Object.keys(comps).forEach(function (slug) {
        if (!(slug in merged)) merged[slug] = comps[slug];
      });
    } catch (e) {}
  });
  return merged;
}
var REGISTRY = null;
function registryEntry(slug) {
  if (!REGISTRY) REGISTRY = readRegistries();
  return REGISTRY[slug] || null;
}

// slug -> PascalCase, e.g. "read-only-tag" -> "ReadOnlyTag".
function pascal(slug) {
  return slug.replace(/(^|[-_])([a-z0-9])/g, function (_, __, ch) {
    return ch.toUpperCase();
  });
}

// styleText is the already-comment-stripped stylesheet the cssProperties scan
// reads. Phase 3: it is the asset base plus the page chrome rather than a seed's
// inlined <style>, measured token-set-identical for all 35 slugs.
function buildDeclaration(slug, styleText) {
  var meta = COMPONENT_META[slug];
  if (meta) {
    var cssProps = consumedVars(styleText, meta.cssSelector).map(
      function (name) {
        return { name: name };
      },
    );
    return {
      kind: "class",
      customElement: true,
      name: meta.className,
      tagName: meta.tagName,
      description: meta.description,
      attributes: meta.attributes,
      slots: meta.slots,
      cssParts: meta.cssParts,
      cssProperties: cssProps,
    };
  }
  // Registry-derived fallback: no hand-authored contract yet for this slug, so
  // derive attributes from the registry's variant axes instead of throwing.
  var entry = registryEntry(slug);
  var variants = (entry && entry.variants) || {};
  var attributes = Object.keys(variants).map(function (axis) {
    return {
      name: axis.toLowerCase(),
      type: { text: (variants[axis] || []).join(" | ") },
    };
  });
  // Ownership is declared in matrix.js, not guessed. Guessing "ds-<slug>"
  // silently produced an EMPTY token surface for the 27 slugs whose class
  // differs (issue #474): schema-valid, and wrong. A slug owning more than one
  // prefix takes the union, sorted so the dist cannot shift with map order --
  // tag-stage (the shared ds-tag base plus its own ds-tag-stage rules) was
  // the one example of this until the 2026-08-12 fold-in retired it into
  // tag-read-only's single-prefix Type axis; matrix.js's CSS_OWNERS has no
  // multi-prefix entry today.
  var owned = new Set();
  matrix.ownedPrefixes(slug).forEach(function (prefix) {
    consumedVars(styleText, prefix).forEach(function (name) {
      owned.add(name);
    });
  });
  var cssProps2 = Array.from(owned)
    .sort()
    .map(function (name) {
      return { name: name };
    });
  return {
    kind: "class",
    customElement: true,
    name: pascal(slug),
    tagName: "zen-" + slug,
    description: (entry && entry.description) || pascal(slug) + " component.",
    attributes: attributes,
    cssParts: [],
    cssProperties: cssProps2,
  };
}

// Phase 3: the slug list and group come from the renderer's own matrix, not
// from a directory listing of frozen seeds. Verified equivalent before the
// switch: same 35 slugs, and groupFor matched the seeds' @dsCard group marker
// for all 35 with zero differences.
function deriveCanonical() {
  // render.css is built from the assets knowledge owns: tokens.css + ds-base.css,
  // in the order the render read path uses. ds-fonts.css is read here too but
  // emitted separately, see the note on fontsCss below. Phase 0's byte-identity
  // guard against the deduped seed stylesheet retired with the seeds at phase 3:
  // its claim ("the relocated assets still match the frozen capture") was
  // migration safety, and the migration completed and was verified end-to-end at
  // phase 2.
  // ds-fonts.css is emitted SEPARATELY. It is six base64 woff2 subsets, 336 KB
  // of the 478 KB this sheet used to be: 70% of the stylesheet was type, not
  // component CSS. That is what broke the 256 KiB card cap, and splitting the
  // sheet per component would not have touched it, because every per-component
  // slice would still have carried the fonts.
  //
  // The offline contract ("NO network font loads") is kept, as an OPT-IN: a
  // consumer needing standalone files inlines both artifacts, which is what
  // build-bundle.js does. A consumer with its own font pipeline, such as the
  // docs site, takes render.css alone and no longer downloads the type library
  // to show one button.
  var fontsCss = fs.readFileSync(
    path.join(REPO_ROOT, "components", "render", "renderer", "ds-fonts.css"),
    "utf8",
  );
  var assetBase =
    fs.readFileSync(path.join(REPO_ROOT, "tokens", "tokens.css"), "utf8") +
    "\n" +
    fs.readFileSync(
      path.join(REPO_ROOT, "components", "render", "renderer", "ds-base.css"),
      "utf8",
    );
  var css = assetBase;

  // The stylesheet the CEM cssProperties scan reads, assembled to match what the
  // seeds' extractStyle produced: every <style> block joined, then comments
  // stripped. The seeds' first block is now the asset base, their second the page
  // chrome. Measured dist-neutral: 0 of 35 slugs change their token set.
  // The CEM scan reads the same BYTES it always did, though no longer in the
  // same order: it was tokens + fonts + ds-base, it is now tokens + ds-base +
  // fonts. custom-elements.json is byte-identical across the change, and it can
  // be, because buildDeclaration's scan is order-insensitive. Stated rather than
  // implied: the guarantee rests on that property, so anyone making the scan
  // order-sensitive has to revisit this line.
  var cemStyle = stripComments(
    assetBase + "\n" + fontsCss + "\n" + PAGE_CSS,
  );

  var fragments = {};
  var modules = [];
  var renderIndex = [];

  RENDER_SLUGS.forEach(function (slug) {
    fragments[slug] = deriveFragment(slug);
    var decl = buildDeclaration(slug, cemStyle);
    modules.push({
      kind: "javascript-module",
      path: DIST_DIR_REL + "/fragments/" + slug + ".html",
      declarations: [decl],
    });
    renderIndex.push({
      slug: slug,
      tagName: decl.tagName,
      group: groupFor(slug),
      fragment: "fragments/" + slug + ".html",
      tokensConsumed: decl.cssProperties.length,
    });
  });

  // Slice 2: for slugs with a template, replace the captured fragment with a
  // derive-from-facts and append the derived per-variant CSS to the shared sheet.
  var tokenMap = loadTokenMap(css);
  var derivedCss = [];
  var sourceBySlug = {};
  renderIndex.forEach(function (r) {
    if (TEMPLATES[r.slug]) {
      var facts = readAppearance(r.slug, ANATOMY_DIR);
      var templateOut = TEMPLATES[r.slug](facts, { tokenMap: tokenMap });
      fragments[r.slug] = templateOut.fragment;
      if (templateOut.css) {
        derivedCss.push(
          "/* " + r.slug + " (derived-from-facts) */\n" + templateOut.css,
        );
      }
      sourceBySlug[r.slug] = "derived";
    } else {
      sourceBySlug[r.slug] = "rendered";
    }
    r.source = sourceBySlug[r.slug];
  });
  if (derivedCss.length) {
    css =
      css +
      "\n\n/* ===== derived-from-facts (slice 2) ===== */\n" +
      derivedCss.join("\n");
  }

  var cem = { schemaVersion: CEM_SCHEMA_VERSION, modules: modules };

  var ajv = new Ajv({ strict: false, allErrors: true });
  var validateCem = ajv.compile(CEM_SCHEMA);
  if (!validateCem(cem)) {
    throw new Error(
      "emitted CEM is not a valid Custom Elements Manifest:\n" +
        JSON.stringify(validateCem.errors, null, 2),
    );
  }

  var manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatedBy: "scripts/render/derive-canonical.js",
    cem: "custom-elements.json",
    css: "render.css",
    fontsCss: "render-fonts.css",
    // The page framing a standalone consumer applies LAST, as CSS text (one
    // body rule). Shipped in the manifest so a consumer that is not
    // build-bundle can read it instead of restating it: the editor's render
    // panel was the first to need it and had copied it by hand, with a
    // different padding and a different place in the cascade.
    pageCss: PAGE_CSS,
    renders: renderIndex,
  };

  return {
    css: css,
    fontsCss: fontsCss,
    pageCss: PAGE_CSS,
    fragments: fragments,
    cem: cem,
    manifest: manifest,
  };
}

// Prune: a fragment whose slug the manifest no longer lists is a fossil, and
// this producer used to leave it tracked, shipped and vendored (#520, #572),
// exactly as a usage note once fossilised through a rename (#567). Same three
// guards as pruneNotes there. The wipe guard: an empty slug set is a missing
// input, not a retirement, and "derive produced nothing so delete everything"
// is the shape that once removed 179 committed anatomy files. The ceiling: a
// partial or broken derive is not a mass retirement. The split: the decision
// is vetted BEFORE anything is written, so a refused run leaves the dist
// untouched rather than half-written.
var PRUNE_CEILING = 10;

function fragmentsToPrune(fragmentsDir, knownSlugs) {
  if (!knownSlugs.length) {
    throw new Error("pruneFragments: refusing to prune against an empty slug set");
  }
  var keep = Object.create(null);
  knownSlugs.forEach(function (slug) {
    keep[slug + ".html"] = true;
  });
  var doomed = fs.existsSync(fragmentsDir)
    ? fs.readdirSync(fragmentsDir).filter(function (f) {
        return f.endsWith(".html") && !keep[f];
      })
    : [];
  if (doomed.length > PRUNE_CEILING) {
    throw new Error(
      "pruneFragments: refusing to delete " + doomed.length + " fragments in one run " +
        "(ceiling " + PRUNE_CEILING + "). This is a partial or broken derive, not a " +
        "retirement. Nothing was written or deleted. Files: " + doomed.join(", "),
    );
  }
  return doomed.sort();
}

function pruneFragments(fragmentsDir, doomed) {
  return doomed.map(function (f) {
    fs.unlinkSync(path.join(fragmentsDir, f));
    return f;
  });
}

// CLI: write the derived fragments + css + CEM + manifest into components/render/dist/.
// dist is a build output: it is written locally to prove the chain but is never
// committed (the CI derive workflow that ships it to consumers is slice 1b).
function writeDist(distDir) {
  var out = deriveCanonical();
  var fragmentsDir = path.join(distDir, "fragments");
  // Vet the prune against the manifest before the first write.
  var doomed = fragmentsToPrune(
    fragmentsDir,
    out.manifest.renders.map(function (r) {
      return r.slug;
    }),
  );
  fs.mkdirSync(fragmentsDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "render.css"), out.css);
  fs.writeFileSync(path.join(distDir, "render-fonts.css"), out.fontsCss);
  Object.keys(out.fragments).forEach(function (slug) {
    fs.writeFileSync(
      path.join(distDir, "fragments", slug + ".html"),
      out.fragments[slug],
    );
  });
  fs.writeFileSync(
    path.join(distDir, "custom-elements.json"),
    JSON.stringify(out.cem, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(distDir, "render-manifest.json"),
    JSON.stringify(out.manifest, null, 2) + "\n",
  );
  out.pruned = pruneFragments(fragmentsDir, doomed);
  return out;
}

if (require.main === module) {
  var repoRoot = path.resolve(__dirname, "..", "..");
  var distDir = path.join(repoRoot, "components", "render", "dist");
  var out = writeDist(distDir);
  process.stdout.write(
    "derived " +
      out.manifest.renders.length +
      " render(s) -> " +
      distDir +
      (out.pruned.length
        ? ", pruned " + out.pruned.length + " stale fragment(s): " + out.pruned.join(", ")
        : "") +
      "\n",
  );
  out.manifest.renders.forEach(function (r) {
    process.stdout.write(
      "  " + r.slug + " (" + r.tagName + ", " + r.tokensConsumed + " tokens)\n",
    );
  });
}

module.exports = {
  deriveCanonical: deriveCanonical,
  writeDist: writeDist,
  fragmentsToPrune: fragmentsToPrune,
  pruneFragments: pruneFragments,
  PRUNE_CEILING: PRUNE_CEILING,
  referencedVars: referencedVars,
  definedVars: definedVars,
  consumedVars: consumedVars,
  COMPONENT_META: COMPONENT_META,
};
