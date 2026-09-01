"use strict";

var fs = require("node:fs");
var path = require("node:path");
var Ajv = require("ajv/dist/2020");
// Compiled the same way the suite compiles this schema. Under strict:false Ajv
// silently ignores an unknown format, so without this a `"format"` added to
// schemas/graph-jsonld.json would be enforced by the test and not by the gate.
var addFormats = require("ajv-formats");

var ROOT = path.resolve(__dirname, "..", "..");

var coverageMod = require("./coverage.js");

var COVERAGE_WARN_THRESHOLD = 0.95;
// Coverage breaches report as Warning during PR2b rollout; promote to
// "violation" once PR1's per-component fix is confirmed stable (spec PR2).
var COVERAGE_BREACH_TIER = "warning";

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

// Pure analysis over a graph object. Returns { dangling[], coverage{}, orphans[], typeViolations[] }.
// Optional `vocabulary` (graph/vocabulary.json shape) enables typed-edge endpoint checks.
function analyze(graph, vocabulary) {
  var ids = new Set(
    graph.nodes.map(function (n) {
      return n.id;
    }),
  );
  var dangling = [];
  var compositionEdges = 0;
  var patternComponentEdges = 0;
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
    if (e.type === "composed_of") compositionEdges++;
    if (e.type === "uses_component") patternComponentEdges++;
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

  var nodeTypeById = new Map(
    graph.nodes.map(function (n) {
      return [n.id, n.type];
    }),
  );
  var typeViolations = [];
  if (vocabulary && vocabulary.edgeTypes) {
    graph.edges.forEach(function (e) {
      var spec = vocabulary.edgeTypes[e.type];
      if (!spec) {
        typeViolations.push(
          "edge type '" + e.type + "' is not in the vocabulary",
        );
        return;
      }
      var st = nodeTypeById.get(e.source);
      var tt = nodeTypeById.get(e.target);
      if (st && spec.source.indexOf(st) === -1) {
        typeViolations.push(
          "edge " +
            e.type +
            " source '" +
            e.source +
            "' is a " +
            st +
            " (allowed source: " +
            spec.source.join(", ") +
            ")",
        );
      }
      if (tt && spec.target.indexOf(tt) === -1) {
        typeViolations.push(
          "edge " +
            e.type +
            " target '" +
            e.target +
            "' is a " +
            tt +
            " (allowed target: " +
            spec.target.join(", ") +
            ")",
        );
      }
    });
  }

  return {
    dangling: dangling,
    coverage: {
      categoriesWithoutA11y: categoriesWithoutA11y,
      criteriaUnreferenced: criteriaUnreferenced,
      componentsWithoutCategory: componentsWithoutCategory,
    },
    orphans: orphans,
    typeViolations: typeViolations,
    compositionEdges: compositionEdges,
    patternComponentEdges: patternComponentEdges,
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

// The emitted JSON-LD against its schema. It runs here, on the file derive:graph
// just wrote, because nothing else validates the FRESH document: the graph drift
// guard catches a bad one only as "stale, regenerate and commit", which points the
// author at the wrong fix, and the suite's schema test reads the committed copy so
// it would still be validating the last good one.
// `doc` is for tests; production passes nothing and the document is read from
// disk, after derive:graph wrote it in the workflows that run them in that order.
//
// Be exact about the reach, because it is narrower than it looks. graph.jsonld is
// a COMMITTED artifact, so the missing-file branch only fires if it is deleted or
// relocated. A deriver that silently stopped emitting it leaves the stale
// committed copy on disk: this validates that copy, finds it schema-valid, and
// passes -- and the drift guard sees an unmodified file and says nothing either.
// What catches that is graph-jsonld-emit's losslessness assertion, and only once
// the graph's content next changes.
//
// What this DOES cover, and nothing else did before it: a to-jsonld or context
// change that emits a schema-violating document, reported as a schema violation
// rather than as "the artifact is stale, regenerate it".
function jsonldSchemaErrors(doc) {
  var schemaPath = path.join(ROOT, "schemas", "graph-jsonld.json");
  if (!fs.existsSync(schemaPath)) {
    return ["graph.jsonld: schemas/graph-jsonld.json is missing"];
  }
  var ld = doc;
  if (ld === undefined) {
    var ldPath = path.join(ROOT, "graph", "dist", "graph.jsonld");
    if (!fs.existsSync(ldPath)) {
      return [
        "graph.jsonld: graph/dist/graph.jsonld is missing — derive:graph did not emit it",
      ];
    }
    try {
      ld = JSON.parse(fs.readFileSync(ldPath, "utf8"));
    } catch (e) {
      // Guarded because this is the artifact derive-graph adopted writeAtomic
      // for, after "Unexpected end of JSON input" was seen in CI. Unguarded, a
      // truncated file threw a SyntaxError out of main() -- which has no
      // try/catch -- naming neither the artifact nor the fix, and aborting
      // before quality-report.json was written and before the dangling-ref and
      // type-violation classes were collected.
      return [
        "graph.jsonld: not parseable as JSON (" +
          e.message +
          ") — regenerate with `npm run derive:graph`",
      ];
    }
  }
  var ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  var validate = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, "utf8")));
  if (validate(ld)) return [];
  return (validate.errors || []).map(function (e) {
    return "graph.jsonld: " + (e.instancePath || "(root)") + " " + e.message;
  });
}

// Pure: fold analysis + coverage into a DQV-shaped report array. `timestamp` is
// always null in the artifact (deterministic; the CI run supplies temporal context).
function buildQualityReport(analysis, coverage, schemaErrorCount) {
  var out = [];
  function push(dimension, metric, value, severity) {
    out.push({
      dimension: dimension,
      metric: metric,
      value: value,
      timestamp: null,
      severity: severity,
    });
  }
  coverageMod.EDGE_KINDS.forEach(function (k) {
    var ratio = coverage.byKind[k].ratio;
    push(
      "coverage",
      k,
      round4(ratio),
      ratio >= COVERAGE_WARN_THRESHOLD ? "info" : COVERAGE_BREACH_TIER,
    );
  });
  var overall = coverage.overall.ratio;
  push(
    "coverage",
    "overall",
    round4(overall),
    overall >= COVERAGE_WARN_THRESHOLD ? "info" : COVERAGE_BREACH_TIER,
  );

  function integrity(metric, value) {
    push("integrity", metric, value, value > 0 ? "violation" : "info");
  }
  integrity("schema_errors", schemaErrorCount);
  integrity("dangling_edges", analysis.dangling.length);
  integrity("typed_edge_violations", analysis.typeViolations.length);

  push("connectivity", "orphan_nodes", analysis.orphans.length, "info");
  push(
    "connectivity",
    "components_without_category",
    analysis.coverage.componentsWithoutCategory.length,
    "info",
  );
  push(
    "connectivity",
    "categories_without_a11y",
    analysis.coverage.categoriesWithoutA11y.length,
    "info",
  );
  push(
    "connectivity",
    "criteria_unreferenced",
    analysis.coverage.criteriaUnreferenced.length,
    "info",
  );
  push(
    "connectivity",
    "composition_edges",
    analysis.compositionEdges || 0,
    "info",
  );
  push(
    "connectivity",
    "pattern_component_edges",
    analysis.patternComponentEdges || 0,
    "info",
  );
  return out;
}

function main() {
  var graph = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph", "dist", "graph.json"), "utf8"),
  );
  var vocabulary = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph", "vocabulary.json"), "utf8"),
  );
  var schemaErrs = schemaErrors(graph);
  // Computed HERE, with the other failure classes, not after their exit. A change
  // that breaks both -- a to-jsonld edit that also introduces a dangling ref --
  // used to report only the first, so the author fixed it, re-ran, and met the
  // second on the next round.
  var ldErrors = jsonldSchemaErrors();
  // Deliberately NOT in quality-report.json, neither folded into `schema_errors`
  // nor as a sibling metric.
  //
  // Folding conflates subjects: that metric names schemas/graph.json and
  // graph.json, so counting graph.jsonld violations in it points a reader at the
  // wrong schema and the wrong document. A sibling metric would be honest, but it
  // changes a dist artifact that ships to consumers, which this change otherwise
  // does not touch -- a report shape change wants its own PR and its own bump.
  //
  // So the report stays SCOPED to graph.json, which makes it accurate rather than
  // under-counting, and graph.jsonld validity is reported by this gate's own
  // failure output. Worth revisiting when the report next changes shape.
  var r = analyze(graph, vocabulary);
  var coverage = coverageMod.computeCoverage(ROOT, graph);
  var qualityReport = buildQualityReport(r, coverage, schemaErrs.length);
  // The slug-collisions count is a derive-time identity fact carried in the
  // graph/dist/collisions.json sidecar; surface it here as an info metric
  // (same 5-key shape as the connectivity metrics). Pushed in main(), not the
  // pure buildQualityReport, so that function stays file-IO-free and testable.
  var collisionsCount = 0;
  try {
    var col = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "graph", "dist", "collisions.json"),
        "utf8",
      ),
    );
    collisionsCount = (col.slug_collisions || []).length;
  } catch (e) {
    /* sidecar absent: report 0 */
  }
  qualityReport.push({
    dimension: "identity",
    metric: "slug_collisions",
    value: collisionsCount,
    timestamp: null,
    severity: "info",
  });
  fs.writeFileSync(
    path.join(ROOT, "graph", "dist", "quality-report.json"),
    JSON.stringify(qualityReport, null, 2) + "\n",
  );

  var report = [
    "### Knowledge graph report",
    "- categories without a11y_ref: " + r.coverage.categoriesWithoutA11y.length,
    "- a11y criteria referenced by nothing: " +
      r.coverage.criteriaUnreferenced.length,
    "- components with no category: " +
      r.coverage.componentsWithoutCategory.length,
    "- orphan nodes: " + r.orphans.length,
    "- edge-type violations: " + r.typeViolations.length,
    "- coverage (overall): " + round4(coverage.overall.ratio),
  ].join("\n");
  var summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    try {
      fs.appendFileSync(summary, report + "\n");
    } catch (e) {
      console.log(report);
    }
  } else console.log(report);

  var coverageWarnings = qualityReport.filter(function (e) {
    return e.severity === "warning";
  });
  if (coverageWarnings.length) {
    console.warn(
      "validate-graph WARNING — coverage below " +
        COVERAGE_WARN_THRESHOLD +
        ":",
    );
    coverageWarnings.forEach(function (e) {
      console.warn("  - " + e.metric + ": " + e.value);
    });
  }

  if (
    schemaErrs.length ||
    r.dangling.length ||
    r.typeViolations.length ||
    ldErrors.length
  ) {
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
    if (r.typeViolations.length) {
      failParts.push(
        "\n**FAILED — " +
          r.typeViolations.length +
          " edge-type violation(s):**\n" +
          r.typeViolations
            .map(function (v) {
              return "- " + v;
            })
            .join("\n"),
      );
    }
    if (ldErrors.length) {
      failParts.push(
        "### validate-graph: graph.jsonld violates schemas/graph-jsonld.json\n" +
          ldErrors
            .map(function (e) {
              return "- " + e;
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
    if (r.typeViolations.length) {
      console.error("validate-graph FAILED — edge-type violations:");
      r.typeViolations.forEach(function (v) {
        console.error("  - " + v);
      });
    }
    if (ldErrors.length) {
      console.error(
        "validate-graph FAILED — the emitted graph.jsonld violates schemas/graph-jsonld.json:",
      );
      ldErrors.forEach(function (e) {
        console.error("  - " + e);
      });
    }
    process.exit(1);
  }
  console.log(
    "validate-graph: OK (no dangling refs, graph.jsonld schema-valid)",
  );
}

if (require.main === module) main();

module.exports = {
  analyze: analyze,
  schemaErrors: schemaErrors,
  jsonldSchemaErrors: jsonldSchemaErrors,
  buildQualityReport: buildQualityReport,
};
