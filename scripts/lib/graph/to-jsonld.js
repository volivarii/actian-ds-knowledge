"use strict";

// Pure transform: a built knowledge-graph object ({ _meta, nodes, edges }) plus
// the parsed graph/context.jsonld -> a JSON-LD document. Lossless: edges are
// reified (kept as objects in @graph) and every node/edge field is copied
// through, so graph.jsonld carries exactly what graph.json carries.
// Node-id prefixes double as compact-IRI prefixes via the context, so ids like
// "component:badge" are already valid @ids and need no transformation.

var NODE_TYPE = {
  component: "Component",
  category: "Category",
  a11y_criterion: "A11yCriterion",
  foundation_section: "FoundationSection",
  motion_pattern: "MotionPattern",
  content_topic: "ContentTopic",
};

function toJsonLd(graph, contextDoc) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error("to-jsonld: graph must have nodes[] and edges[]");
  }
  var nodes = graph.nodes.map(function (n) {
    var term = NODE_TYPE[n.type];
    if (!term) throw new Error("to-jsonld: unknown node type '" + n.type + "'");
    var o = { "@id": n.id, "@type": term };
    Object.keys(n).forEach(function (k) {
      // The reserved output keys are set above; exclude the source names they
      // derive from AND their @-spellings so a same-named source field can
      // never clobber the computed @id/@type.
      if (k !== "id" && k !== "type" && k !== "@id" && k !== "@type")
        o[k] = n[k];
    });
    return o;
  });
  var edges = graph.edges.map(function (e) {
    var o = {
      "@type": "Edge",
      edgeType: e.type,
      source: e.source,
      target: e.target,
    };
    Object.keys(e).forEach(function (k) {
      // Keep the reified @type/edgeType/source/target; a source field named
      // edgeType or @type must not overwrite them.
      if (
        k !== "type" &&
        k !== "source" &&
        k !== "target" &&
        k !== "@type" &&
        k !== "edgeType"
      )
        o[k] = e[k];
    });
    return o;
  });
  var context =
    contextDoc && contextDoc["@context"] ? contextDoc["@context"] : contextDoc;
  // Carry _schema_version through so the derived view is self-describing about
  // which graph.json generation it conforms to (mirrors graph.json's envelope).
  return {
    "@context": context,
    _schema_version: graph._schema_version,
    _meta: graph._meta,
    "@graph": nodes.concat(edges),
  };
}

module.exports = { toJsonLd: toJsonLd, NODE_TYPE: NODE_TYPE };
