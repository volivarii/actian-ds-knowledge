"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var {
  buildPaths,
  buildPathsFromManifest,
} = require("../clients/resolve-paths.js");

var MANIFEST = {
  manifest_schema_version: "v1",
  paths: {
    "accessibility.index": {
      path: "accessibility/dist/a11y-index.json",
      type: "json",
      origin: "ci",
      description: "x",
    },
  },
  collections: {
    // NOT component-keyed: content sections have their own slug namespace, and
    // eight app-context/content slugs already collide with component slugs
    // (api-key, dataset, field, lineage, scanner, suggestion, template,
    // user-group). Rename history must not reach here.
    "content.section": {
      dir: "content/src",
      pattern: "{slug}.md",
      type: "markdown",
      origin: "human",
      description: "y",
    },
    // Component-keyed, so rename history applies.
    "components.guidelineDoc.byKey": {
      dir: "components/dist/guidelines",
      pattern: "{slug}.json",
      slugNamespace: "component",
      type: "json",
      origin: "ci",
      description: "y",
    },
  },
};

test("buildPathsFromManifest joins entry paths onto vendorRoot", function () {
  var P = buildPathsFromManifest(MANIFEST, "/v");
  assert.equal(
    P.accessibility.index,
    path.join("/v", "accessibility/dist/a11y-index.json"),
  );
  assert.equal(typeof P.content.section, "function");
  assert.equal(
    P.content.section("forms"),
    path.join("/v", "content/src", "forms.md"),
  );
});

// The identity ledger (components/dist/identity.json) exists so a consumer
// holding a slug that has since been renamed resolves it instead of breaking on
// it. Without this, a Figma display-name change breaks every consumer that
// addresses the component by slug, which is 15 of the 18 manifest collections.
var LEDGER = {
  schemaVersion: "1.0.0",
  entries: {
    KEY_A: {
      slug: "action-bar",
      nodeId: "14747:9839",
      previousSlugs: ["sticky-footer"],
    },
  },
};

test("a component collection resolves a slug the component was renamed away from", function () {
  var P = buildPathsFromManifest(MANIFEST, "/v", LEDGER);
  assert.equal(
    P.components.guidelineDoc.byKey("sticky-footer"),
    path.join("/v", "components/dist/guidelines", "action-bar.json"),
  );
});

// The ledger's namespace is Figma components. Applying it to every {slug}
// collection breaks resolution for the seven that key on something else: with a
// ledger recording `field` -> `form-field`, `appContextSrc("field")` returned
// null for an app-context entity file that exists and was never renamed.
test("a collection in another slug namespace is not touched by component renames", function () {
  var P = buildPathsFromManifest(MANIFEST, "/v", LEDGER);
  assert.equal(
    P.content.section("sticky-footer"),
    path.join("/v", "content/src", "sticky-footer.md"),
    "content sections are not component-keyed, so the rename must not apply",
  );
});

// A freed name can be reused. If a retired slug were mapped unconditionally, a
// consumer asking for the slug a DIFFERENT component now carries would be handed
// the renamed one, which is worse than the breakage this feature removes: it
// resolves, so nothing reports it.
test("a slug another component now carries resolves to that component, not the renamed one", function () {
  var reused = {
    schemaVersion: "1.0.0",
    entries: {
      KEY_A: {
        slug: "action-bar",
        nodeId: "1:1",
        previousSlugs: ["sticky-footer"],
      },
      KEY_B: { slug: "sticky-footer", nodeId: "2:2", previousSlugs: [] },
    },
  };
  var P = buildPathsFromManifest(MANIFEST, "/v", reused);
  assert.equal(
    P.content.section("sticky-footer"),
    path.join("/v", "content/src", "sticky-footer.md"),
  );
});

test("buildPaths reads the identity ledger from the vendored snapshot", function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "rp-"));
  fs.writeFileSync(
    path.join(dir, "paths-manifest.json"),
    JSON.stringify(MANIFEST),
  );
  fs.mkdirSync(path.join(dir, "components", "dist"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "components", "dist", "identity.json"),
    JSON.stringify(LEDGER),
  );

  var P = buildPaths(dir);
  assert.equal(
    P.components.guidelineDoc.byKey("sticky-footer"),
    path.join(dir, "components/dist/guidelines", "action-bar.json"),
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

// Older vendored snapshots have no ledger. Resolution must carry on rather than
// throw, or upgrading the client would break every consumer pinned to a snapshot
// taken before this landed.
test("a snapshot with no identity ledger still resolves", function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "rp-"));
  fs.writeFileSync(
    path.join(dir, "paths-manifest.json"),
    JSON.stringify(MANIFEST),
  );
  var P = buildPaths(dir);
  assert.equal(
    P.content.section("forms"),
    path.join(dir, "content/src", "forms.md"),
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("buildPaths reads <vendorRoot>/paths-manifest.json and resolves", function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "rp-"));
  fs.writeFileSync(
    path.join(dir, "paths-manifest.json"),
    JSON.stringify(MANIFEST),
  );
  var P = buildPaths(dir);
  assert.equal(
    P.accessibility.index,
    path.join(dir, "accessibility/dist/a11y-index.json"),
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("buildPathsFromManifest rejects an unsupported manifest_schema_version", function () {
  assert.throws(function () {
    buildPathsFromManifest(
      { manifest_schema_version: "v2", paths: {}, collections: {} },
      "/v",
    );
  }, /manifest_schema_version/);
});

test("buildPaths throws a diagnostic when the manifest is absent", function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "rp-"));
  assert.throws(function () {
    buildPaths(dir);
  }, /manifest not found at .*paths-manifest\.json/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("buildPaths throws a diagnostic on malformed manifest JSON", function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "rp-"));
  fs.writeFileSync(path.join(dir, "paths-manifest.json"), "{ not json");
  assert.throws(function () {
    buildPaths(dir);
  }, /failed to parse/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// {name} collections (the relocated renderer)
// ---------------------------------------------------------------------------
// A {name} collection addresses a member by its path relative to `dir`, rather
// than by a slug that gets an extension appended. Before this was supported the
// placeholder survived substitution, matched the leftover-placeholder branch,
// and fell into the recursive "<slug>.md" sub-directory walk, so EVERY lookup
// returned null. Latent since the renderer collection was declared, because it
// had no consumer until the plugin began requiring the vendored renderer.

var NAME_MANIFEST = {
  manifest_schema_version: "v1",
  paths: {},
  collections: {
    "components.render.renderer": {
      dir: "components/render/renderer",
      pattern: "{name}",
      recursive: true,
      type: "text",
      origin: "human",
      description: "z",
    },
  },
};

test("{name} collections resolve a flat member", function () {
  var P = buildPathsFromManifest(NAME_MANIFEST, "/v");
  assert.equal(
    P.components.render.renderer("ds-base.css"),
    path.join("/v", "components/render/renderer", "ds-base.css"),
  );
});

test("{name} collections resolve a nested member", function () {
  var P = buildPathsFromManifest(NAME_MANIFEST, "/v");
  assert.equal(
    P.components.render.renderer("html-renderers/ds-html-map.js"),
    path.join(
      "/v",
      "components/render/renderer",
      "html-renderers/ds-html-map.js",
    ),
  );
});

test("{name} collections reject traversal outside the collection dir", function () {
  var P = buildPathsFromManifest(NAME_MANIFEST, "/v");
  assert.throws(function () {
    P.components.render.renderer("../../../etc/passwd");
  }, /escapes the collection directory/);
});

test("{name} collections reject an absolute path", function () {
  var P = buildPathsFromManifest(NAME_MANIFEST, "/v");
  assert.throws(function () {
    P.components.render.renderer("/etc/passwd");
  }, /escapes the collection directory/);
});

test("{slug} collections are unaffected by {name} support", function () {
  var P = buildPathsFromManifest(MANIFEST, "/v");
  assert.equal(
    P.content.section("forms"),
    path.join("/v", "content/src", "forms.md"),
  );
});

test("{name} collections reject an empty or non-string member", function () {
  var P = buildPathsFromManifest(NAME_MANIFEST, "/v");
  [undefined, null, "", 42].forEach(function (bad) {
    assert.throws(
      function () {
        P.components.render.renderer(bad);
      },
      /needs a member name/,
      "must reject " + JSON.stringify(bad) + " with a diagnostic",
    );
  });
});

test("{name} collections reject '.' (the collection dir itself)", function () {
  var P = buildPathsFromManifest(NAME_MANIFEST, "/v");
  assert.throws(function () {
    P.components.render.renderer(".");
  }, /escapes the collection directory/);
});

// Regression: collName/coll are `var` loop bindings. If the closure captured
// them instead of taking them as parameters, every collection would resolve
// against the LAST one declared, and the diagnostic would name the wrong one.
test("each collection closes over its OWN dir and name", function () {
  var P = buildPathsFromManifest(
    {
      manifest_schema_version: "v1",
      paths: {},
      collections: {
        first: {
          dir: "dir-one",
          pattern: "{name}",
          type: "text",
          origin: "human",
          description: "a",
        },
        second: {
          dir: "dir-two",
          pattern: "{name}",
          type: "text",
          origin: "human",
          description: "b",
        },
      },
    },
    "/v",
  );
  assert.equal(P.first("x.css"), path.join("/v", "dir-one", "x.css"));
  assert.equal(P.second("x.css"), path.join("/v", "dir-two", "x.css"));
  assert.throws(function () {
    P.first("");
  }, /collection 'first'/);
  assert.throws(function () {
    P.second("");
  }, /collection 'second'/);
});

// ---------------------------------------------------------------------------
// Unresolvable patterns fail loudly
// ---------------------------------------------------------------------------
// A pattern with no {slug} token cannot address a member. Both shapes in the
// manifest used to fail SILENTLY, which is the root cause that let the {name}
// bug survive: one returned a fabricated literal path, the other returned null.

function collWith(pattern) {
  return buildPathsFromManifest(
    {
      manifest_schema_version: "v1",
      paths: {},
      collections: {
        probe: {
          dir: "some/dir",
          pattern: pattern,
          type: "json",
          origin: "ci",
          description: "d",
        },
      },
    },
    "/v",
  );
}

test("a '<angle bracket>' pattern throws instead of returning a literal path", function () {
  var P = collWith("<topSlug>/.../<slug>.json");
  assert.throws(function () {
    P.probe("anything");
  }, /cannot address a member/);
});

test("a '{name}.json' pattern throws instead of returning null", function () {
  var P = collWith("{name}.json");
  assert.throws(function () {
    P.probe("icons");
  }, /cannot address a member/);
});

test("the diagnostic names the collection and its pattern", function () {
  var P = collWith("<topSlug>/.../<slug>.json");
  assert.throws(function () {
    P.probe("x");
  }, /collection 'probe'.*<topSlug>/s);
});

test("every {slug} shape in the real manifest still resolves", function () {
  // Driven from the REAL manifest, not a hand-copied list, so a collection
  // added later is covered automatically and this guard cannot drift.
  var manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "paths-manifest.json"), "utf8"),
  );
  var checked = 0;
  Object.keys(manifest.collections).forEach(function (key) {
    var pattern = manifest.collections[key].pattern;
    if (pattern.indexOf("{slug}") === -1) return; // descriptive, covered above
    checked++;
    var P = collWith(pattern);
    assert.doesNotThrow(
      function () {
        P.probe("button");
      },
      "pattern " + pattern + " (" + key + ") must stay resolvable",
    );
  });
  assert.ok(
    checked >= 7,
    "expected several {slug} collections, saw " + checked,
  );
});

test("a descriptive collection says so rather than blaming the pattern", function () {
  var P = buildPathsFromManifest(
    {
      manifest_schema_version: "v1",
      paths: {},
      collections: {
        leafy: {
          dir: "some/dir",
          pattern: "<topSlug>/.../<slug>.json",
          resolvable: false,
          recursive: true,
          type: "json",
          origin: "ci",
          description: "d",
        },
      },
    },
    "/v",
  );
  // Regression guard for a var-hoisting shadow: the sub-directory walk inside
  // the resolver declares `var entry`, which is function-scoped. Naming the
  // collection parameter `entry` made it hoist over the parameter, so reading
  // the flag threw "Cannot read properties of undefined" instead of producing
  // this message. Asserting the message, not just that it throws, pins it.
  assert.throws(function () {
    P.leafy("anything");
  }, /declared descriptive-only \(resolvable: false\)/);
});

// The rename index is a lookup keyed by slug, so a slug that collides with a
// name on Object.prototype must not resolve through the prototype. Without a
// null-prototype map, `constructor` resolves to Object itself, which is truthy,
// and the path becomes the stringified function.
test("a slug colliding with an Object.prototype key resolves normally", function () {
  var P = buildPathsFromManifest(MANIFEST, "/v", LEDGER);
  ["constructor", "toString", "hasOwnProperty"].forEach(function (slug) {
    assert.equal(
      P.content.section(slug),
      path.join("/v", "content/src", slug + ".md"),
      slug + " must resolve to its own path",
    );
  });
});

// ---------------------------------------------------------------------------
// slugNamespace, asserted against the REAL manifest
// ---------------------------------------------------------------------------

var REAL_MANIFEST = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "paths-manifest.json"), "utf8"),
);

test("every collection declared component-keyed actually lives under components/", function () {
  var flagged = Object.keys(REAL_MANIFEST.collections).filter(function (k) {
    return REAL_MANIFEST.collections[k].slugNamespace === "component";
  });
  assert.ok(flagged.length > 0, "the declaration must not be empty");
  flagged.forEach(function (k) {
    assert.match(
      REAL_MANIFEST.collections[k].dir,
      /^components\//,
      k +
        " claims the component slug namespace but its dir is not under components/",
    );
  });
});

// The regression the review caught, asserted at the real-manifest level: eight
// app-context and content slugs collide with component slugs, so component
// rename history reaching those collections would send a never-renamed file
// somewhere else or to null.
test("component rename history cannot redirect an app-context record", function () {
  var ledger = {
    schemaVersion: "1.0.0",
    entries: {
      KEY_X: { slug: "form-field", nodeId: "9:9", previousSlugs: ["field"] },
    },
  };
  // Resolved against the real repo root, because appContextSrc's pattern is
  // "{kind}/{slug}.md": it walks sub-directories, so a fake root returns null
  // for every input and the assertion would hold vacuously.
  var P = buildPathsFromManifest(
    REAL_MANIFEST,
    path.join(__dirname, ".."),
    ledger,
  );

  ["field", "dataset", "api-key", "lineage", "template", "user-group"].forEach(
    function (slug) {
      var resolved = P.appContextSrc(slug);
      assert.ok(
        resolved && resolved.endsWith(path.join("entities", slug + ".md")),
        "appContextSrc(" +
          slug +
          ") must resolve to its own app-context record, got " +
          resolved,
      );
    },
  );
});
