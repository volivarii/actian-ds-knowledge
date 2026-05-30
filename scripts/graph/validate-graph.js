"use strict";

var fs = require("node:fs");
var path = require("node:path");

var ROOT = path.resolve(__dirname, "..", "..");

// Pure analysis over a graph object. Returns { dangling[], coverage{}, orphans[] }.
function analyze(graph) {
  var ids = new Set(graph.nodes.map(function (n) { return n.id; }));
  var dangling = [];
  var endpointsSeen = new Set();
  graph.edges.forEach(function (e) {
    if (!ids.has(e.source)) dangling.push("edge " + e.type + " source '" + e.source + "' not a node");
    if (!ids.has(e.target)) dangling.push("edge " + e.type + " (" + e.source + ") target '" + e.target + "' not a node");
    endpointsSeen.add(e.source); endpointsSeen.add(e.target);
  });

  var catsWithA11y = new Set();
  var a11yReferenced = new Set();
  var componentsInCategory = new Set();
  graph.edges.forEach(function (e) {
    if (e.type === "a11y_ref") { catsWithA11y.add(e.source); a11yReferenced.add(e.target); }
    if (e.type === "in_category") componentsInCategory.add(e.source);
  });
  var categoriesWithoutA11y = graph.nodes
    .filter(function (n) { return n.type === "category" && !catsWithA11y.has(n.id); })
    .map(function (n) { return n.id; });
  var criteriaUnreferenced = graph.nodes
    .filter(function (n) { return n.type === "a11y_criterion" && !a11yReferenced.has(n.id); })
    .map(function (n) { return n.id; });
  var componentsWithoutCategory = graph.nodes
    .filter(function (n) { return n.type === "component" && !componentsInCategory.has(n.id); })
    .map(function (n) { return n.id; });
  var orphans = graph.nodes
    .filter(function (n) { return !endpointsSeen.has(n.id); })
    .map(function (n) { return n.id; });

  return {
    dangling: dangling,
    coverage: { categoriesWithoutA11y: categoriesWithoutA11y, criteriaUnreferenced: criteriaUnreferenced, componentsWithoutCategory: componentsWithoutCategory },
    orphans: orphans,
  };
}

function main() {
  var graph = JSON.parse(fs.readFileSync(path.join(ROOT, "graph", "dist", "graph.json"), "utf8"));
  var r = analyze(graph);

  var report = [
    "### Knowledge graph report",
    "- categories without a11y_ref: " + r.coverage.categoriesWithoutA11y.length,
    "- a11y criteria referenced by nothing: " + r.coverage.criteriaUnreferenced.length,
    "- components with no category: " + r.coverage.componentsWithoutCategory.length,
    "- orphan nodes: " + r.orphans.length,
  ].join("\n");
  var summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) { try { fs.appendFileSync(summary, report + "\n"); } catch (e) { console.log(report); } }
  else console.log(report);

  if (r.dangling.length > 0) {
    console.error("validate-graph FAILED — dangling refs:");
    r.dangling.forEach(function (d) { console.error("  - " + d); });
    process.exit(1);
  }
  console.log("validate-graph: OK (no dangling refs)");
}

if (require.main === module) main();

module.exports = { analyze: analyze };
