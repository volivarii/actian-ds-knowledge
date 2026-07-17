"use strict";

// derive-canonical.js — derive the canonical render dist + Custom Elements
// Manifest from the seed renders in components/render/src/.
//
// Slice 1 SEEDS the renders by capturing the plugin's hand-authored output (see
// the plugin's scripts/render/capture-seed.js), so this derive validates each
// seed and hand-maps the component contract. Slice 2 replaces the capture with a
// real derive-from-facts; the CEM emit + validation here stays the same, only its
// input source swaps (CEM is the source-swap bridge).
//
// deriveCanonical(srcDir) returns { renders, css, fragments, cem, manifest }:
//   renders: { slug: html }, the validated seed documents, passed through.
//   css: the shared stylesheet, deduped once across every seed (byte-identical
//     guard, throws if a seed's inlined style diverges).
//   fragments: { slug: html }, each seed's <body> inner markup, no <style>.
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

var MANIFEST_SCHEMA_VERSION = "1.0.0";
var CEM_SCHEMA_VERSION = "1.0.0";
var DIST_DIR_REL = "components/render/dist";
var REPO_ROOT = path.resolve(__dirname, "..", "..");
var ANATOMY_DIR = path.join(REPO_ROOT, "components", "dist", "anatomy");

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

// Join every <style> block's contents in a document (comments stripped).
function extractStyle(html) {
  var out = [];
  var re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  var m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return stripComments(out.join("\n"));
}

// Raw <style> block content, verbatim (NOT comment-stripped like extractStyle),
// so render.css is byte-faithful. The seeds share one inlined stylesheet: the
// FIRST <style> block in the document (the ~421 KB design-system stylesheet).
// A second, tiny <style> block follows it in every seed (page-framing chrome
// the capture harness adds, e.g. "body{margin:...}") but is not part of the
// component's contract, so only the first block is captured here.
function rawStyle(html) {
  var m = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(html);
  return m ? m[1] : "";
}

// The <body> inner markup: the component render itself, with no <style>. This is
// the shippable fragment consumers embed alongside the shared render.css.
function bodyInner(html) {
  var m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (!m) throw new Error("no <body> found in seed");
  return m[1];
}

// The standalone-preview page chrome: the SECOND <style> block every seed
// carries (e.g. "body{margin:0;padding:24px;background:#fff}"). It is not part of
// the component contract, so render.css excludes it, but the standalone @dsCard
// projection needs it. Captured here so build-bundle sources it from the seeds
// instead of hardcoding a copy that could drift; guarded identical across seeds.
function pageStyle(html) {
  var re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  var blocks = [];
  var m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  return blocks.length > 1 ? blocks[1] : "";
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
  while ((m = re.exec(styleText)) !== null) set.add(m[1]);
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
  // `.ds-button` as a class token: the dot-prefixed name not followed by another
  // name char, so `.ds-button--primary`/`__icon`/`[disabled]` match but
  // `.ds-buttonish` does not.
  var selRe = new RegExp("\\." + cssSelector + "(?![a-z0-9])");
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

// Read the @dsCard group from the seed's required first-line marker.
function readGroup(html) {
  var first = html.split("\n")[0];
  var m = /^<!--\s*@dsCard\s+group="([^"]+)"\s*-->/.exec(first);
  return m ? m[1] : null;
}

// Validate a seed is shippable: marker present, self-contained, every referenced
// token defined in the inlined style. Throws with a specific message on failure,
// so a broken seed reds the derive rather than shipping a blank render.
function validateSeed(slug, html) {
  var group = readGroup(html);
  if (!group) {
    throw new Error(slug + ": missing first-line @dsCard group marker");
  }
  if (/\ssrc=|\shref=|@import/.test(html)) {
    throw new Error(slug + ": not self-contained (external reference found)");
  }
  var style = extractStyle(html);
  var refs = referencedVars(html);
  var defs = definedVars(style);
  var unresolved = Array.from(refs).filter(function (n) {
    return !defs.has(n);
  });
  if (unresolved.length) {
    throw new Error(
      slug +
        ": unresolved token(s) not defined in the seed: " +
        unresolved.join(", "),
    );
  }
  return group;
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

// slug -> PascalCase, e.g. "tag-default" -> "TagDefault".
function pascal(slug) {
  return slug.replace(/(^|[-_])([a-z0-9])/g, function (_, __, ch) {
    return ch.toUpperCase();
  });
}

function buildDeclaration(slug, html) {
  var meta = COMPONENT_META[slug];
  var style = extractStyle(html);
  if (meta) {
    var cssProps = consumedVars(style, meta.cssSelector).map(function (name) {
      return { name: name };
    });
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
  var cssProps2 = consumedVars(style, "ds-" + slug).map(function (name) {
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

function deriveCanonical(srcDir) {
  var files = fs
    .readdirSync(srcDir)
    .filter(function (f) {
      return f.endsWith(".html");
    })
    .sort();

  var renders = {};
  var css = null;
  var pageCss = null;
  var fragments = {};
  var modules = [];
  var renderIndex = [];

  files.forEach(function (file) {
    var slug = path.basename(file, ".html");
    var html = fs.readFileSync(path.join(srcDir, file), "utf8");
    var group = validateSeed(slug, html);
    renders[slug] = html;
    // Dedup: buildLeafHtml inlines the whole stylesheet, so every seed carries
    // the same block byte-for-byte. Capture it once; fail loudly if a seed
    // diverges, because the dedup relies on one shared stylesheet.
    var seedCss = rawStyle(html);
    if (css === null) css = seedCss;
    else if (seedCss !== css) {
      throw new Error(
        slug +
          ": stylesheet differs from the shared render.css (" +
          seedCss.length +
          " vs " +
          css.length +
          " chars); the dedup assumes " +
          "one shared inlined stylesheet across all seeds",
      );
    }
    // Guard the page chrome the same way: the standalone card re-adds it, so a
    // seed whose chrome diverges must fail loudly, not ship stale chrome.
    var seedPageCss = pageStyle(html);
    if (pageCss === null) pageCss = seedPageCss;
    else if (seedPageCss !== pageCss) {
      throw new Error(
        slug +
          ": page chrome differs from the shared card page style (" +
          seedPageCss.length +
          " vs " +
          pageCss.length +
          " chars); the standalone card projection assumes one shared chrome",
      );
    }
    fragments[slug] = bodyInner(html);
    var decl = buildDeclaration(slug, html);
    modules.push({
      kind: "javascript-module",
      path: DIST_DIR_REL + "/fragments/" + slug + ".html",
      declarations: [decl],
    });
    renderIndex.push({
      slug: slug,
      tagName: decl.tagName,
      group: group,
      fragment: "fragments/" + slug + ".html",
      tokensConsumed: decl.cssProperties.length,
    });
  });

  // Phase 0 (renderer relocation): the shared render.css base is now sourced from
  // the relocated styling assets in components/render/renderer/, not from a seed's
  // inlined <style>. The seeds' deduped stylesheet (css above) is kept as a loud
  // cross-check: if the assets and the frozen seeds ever diverge, the derive FAILS
  // rather than shipping a mismatch (a real drift signal, not something to tolerate).
  // Order matches the render read path: tokens, then fonts, then ds-base.
  var assetBase =
    fs.readFileSync(path.join(REPO_ROOT, "tokens", "tokens.css"), "utf8") +
    "\n" +
    fs.readFileSync(
      path.join(REPO_ROOT, "components", "render", "renderer", "ds-fonts.css"),
      "utf8",
    ) +
    "\n" +
    fs.readFileSync(
      path.join(REPO_ROOT, "components", "render", "renderer", "ds-base.css"),
      "utf8",
    );
  // Phase 1b-alpha: ds-base.css legitimately gains rules the frozen seeds do not
  // carry (tag color variants + checkbox indeterminate), appended at the END of
  // the file. So the guard relaxes from byte-equality to a PREFIX check: the
  // deduped seed stylesheet must still be a verbatim prefix of the asset base,
  // which still catches an accidental mid-file drift while permitting the
  // intended, purely-appended additions.
  if (assetBase.indexOf(css) !== 0) {
    throw new Error(
      "the deduped seed stylesheet is no longer a verbatim prefix of the asset base " +
        "(" +
        css.length +
        " vs " +
        assetBase.length +
        " chars); ds-base.css drifted mid-file " +
        "rather than only appending the phase-1b tag/checkbox rules",
    );
  }
  css = assetBase; // the assets (ds-base + the appended tag/checkbox rules) are the source of truth

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
      sourceBySlug[r.slug] = "captured";
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
    renders: renderIndex,
  };

  return {
    renders: renders,
    css: css,
    pageCss: pageCss,
    fragments: fragments,
    cem: cem,
    manifest: manifest,
  };
}

// CLI: write the validated renders + CEM + manifest into components/render/dist/.
// dist is a build output: it is written locally to prove the chain but is never
// committed (the CI derive workflow that ships it to consumers is slice 1b).
function writeDist(srcDir, distDir) {
  var out = deriveCanonical(srcDir);
  fs.mkdirSync(path.join(distDir, "fragments"), { recursive: true });
  fs.writeFileSync(path.join(distDir, "render.css"), out.css);
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
  return out;
}

if (require.main === module) {
  var repoRoot = path.resolve(__dirname, "..", "..");
  var srcDir = path.join(repoRoot, "components", "render", "src");
  var distDir = path.join(repoRoot, "components", "render", "dist");
  var out = writeDist(srcDir, distDir);
  process.stdout.write(
    "derived " +
      out.manifest.renders.length +
      " render(s) -> " +
      distDir +
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
  extractStyle: extractStyle,
  referencedVars: referencedVars,
  definedVars: definedVars,
  consumedVars: consumedVars,
  COMPONENT_META: COMPONENT_META,
};
