"use strict";

var fs = require("node:fs");
var path = require("node:path");
var Ajv = require("ajv/dist/2020");

var ROOT = path.resolve(__dirname, "..", "..");

// Pure analysis over a graph object. Returns { dangling[], coverage{}, orphans[] }.
function analyze(graph) {
  var ids = new Set(
    graph.nodes.map(function (n) {
      return n.id;
    }),
  );
  var dangling = [];
  var endpointsSeen = new Set();
  var catsWithA11y = new Set();
  var a11yReferenced = new Set();
  var componentsInCategory = new Set();
  graph.edges.forEach(function (e) {
    if (!ids.has(e.source))
      dangling.push("edge " + e.type + " source '" + e.source + "' not a node");
    if (!ids.has(e.target))
      dangling.push(
        "edge " +
          e.type +
          " (" +
          e.source +
          ") target '" +
          e.target +
          "' not a node",
      );
    endpointsSeen.add(e.source);
    endpointsSeen.add(e.target);
    if (e.type === "a11y_ref") {
      catsWithA11y.add(e.source);
      a11yReferenced.add(e.target);
    }
    if (e.type === "in_category") componentsInCategory.add(e.source);
  });
  var categoriesWithoutA11y = graph.nodes
    .filter(function (n) {
      return n.type === "category" && !catsWithA11y.has(n.id);
    })
    .map(function (n) {
      return n.id;
    });
  var criteriaUnreferenced = graph.nodes
    .filter(function (n) {
      return n.type === "a11y_criterion" && !a11yReferenced.has(n.id);
    })
    .map(function (n) {
      return n.id;
    });
  var componentsWithoutCategory = graph.nodes
    .filter(function (n) {
      return n.type === "component" && !componentsInCategory.has(n.id);
    })
    .map(function (n) {
      return n.id;
    });
  var orphans = graph.nodes
    .filter(function (n) {
      return !endpointsSeen.has(n.id);
    })
    .map(function (n) {
      return n.id;
    });

  return {
    dangling: dangling,
    coverage: {
      categoriesWithoutA11y: categoriesWithoutA11y,
      criteriaUnreferenced: criteriaUnreferenced,
      componentsWithoutCategory: componentsWithoutCategory,
    },
    orphans: orphans,
  };
}

// Returns an array of human-readable schema-violation strings ([] if valid).
function schemaErrors(graph) {
  var schema = JSON.parse(
    fs.readFileSync(path.join(ROOT, "schemas", "graph.json"), "utf8"),
  );
  var validate = new Ajv({ allErrors: true }).compile(schema);
  if (validate(graph)) return [];
  return (validate.errors || []).map(function (e) {
    return "schema: " + (e.instancePath || "(root)") + " " + e.message;
  });
}

function main() {
  var graph = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph", "dist", "graph.json"), "utf8"),
  );
  var schemaErrs = schemaErrors(graph);
  var r = analyze(graph);

  var report = [
    "### Knowledge graph report",
    "- categories without a11y_ref: " + r.coverage.categoriesWithoutA11y.length,
    "- a11y criteria referenced by nothing: " +
      r.coverage.criteriaUnreferenced.length,
    "- components with no category: " +
      r.coverage.componentsWithoutCategory.length,
    "- orphan nodes: " + r.orphans.length,
  ].join("\n");
  var summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    try {
      fs.appendFileSync(summary, report + "\n");
    } catch (e) {
      console.log(report);
    }
  } else console.log(report);

  if (schemaErrs.length || r.dangling.length) {
    var failParts = [];
    if (schemaErrs.length) {
      failParts.push(
        "\n**FAILED — " +
          schemaErrs.length +
          " schema violation(s):**\n" +
          schemaErrs
            .map(function (e) {
              return "- " + e;
            })
            .join("\n"),
      );
    }
    if (r.dangling.length) {
      failParts.push(
        "\n**FAILED — " +
          r.dangling.length +
          " dangling ref(s):**\n" +
          r.dangling
            .map(function (d) {
              return "- " + d;
            })
            .join("\n"),
      );
    }
    var failLine = failParts.join("\n");
    if (summary) {
      try {
        fs.appendFileSync(summary, failLine + "\n");
      } catch (e) {
        /* logged below */
      }
    }
    if (schemaErrs.length) {
      console.error("validate-graph FAILED — schema violations:");
      schemaErrs.forEach(function (e) {
        console.error("  - " + e);
      });
    }
    if (r.dangling.length) {
      console.error("validate-graph FAILED — dangling refs:");
      r.dangling.forEach(function (d) {
        console.error("  - " + d);
      });
    }
    process.exit(1);
  }
  console.log("validate-graph: OK (no dangling refs)");
}

if (require.main === module) main();

module.exports = { analyze: analyze, schemaErrors: schemaErrors };
