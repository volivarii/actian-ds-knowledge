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
// deriveCanonical(srcDir) returns { renders, cem, manifest }:
//   renders  — { slug: html } the validated seed documents, passed through.
//   cem      — a Custom Elements Manifest (validated against the official schema).
//   manifest — the render index (validated against schemas/canonical-render.json).

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

var MANIFEST_SCHEMA_VERSION = "1.0.0";
var CEM_SCHEMA_VERSION = "1.0.0";
var DIST_DIR_REL = "components/render/dist";

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

function buildDeclaration(slug, html) {
  var meta = COMPONENT_META[slug];
  if (!meta) {
    throw new Error(slug + ": no CEM metadata (add it to COMPONENT_META)");
  }
  var style = extractStyle(html);
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

function deriveCanonical(srcDir) {
  var files = fs
    .readdirSync(srcDir)
    .filter(function (f) {
      return f.endsWith(".html");
    })
    .sort();

  var renders = {};
  var modules = [];
  var renderIndex = [];

  files.forEach(function (file) {
    var slug = path.basename(file, ".html");
    var html = fs.readFileSync(path.join(srcDir, file), "utf8");
    var group = validateSeed(slug, html);
    renders[slug] = html;
    var decl = buildDeclaration(slug, html);
    modules.push({
      kind: "javascript-module",
      path: DIST_DIR_REL + "/" + file,
      declarations: [decl],
    });
    renderIndex.push({
      slug: slug,
      tagName: decl.tagName,
      group: group,
      file: file,
      tokensConsumed: decl.cssProperties.length,
    });
  });

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
    renders: renderIndex,
  };

  return { renders: renders, cem: cem, manifest: manifest };
}

// CLI: write the validated renders + CEM + manifest into components/render/dist/.
// dist is a build output: it is written locally to prove the chain but is never
// committed (the CI derive workflow that ships it to consumers is slice 1b).
function writeDist(srcDir, distDir) {
  var out = deriveCanonical(srcDir);
  fs.mkdirSync(distDir, { recursive: true });
  Object.keys(out.renders).forEach(function (slug) {
    fs.writeFileSync(path.join(distDir, slug + ".html"), out.renders[slug]);
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
