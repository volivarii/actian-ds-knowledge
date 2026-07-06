// Zen Variable Id Export — the P2 name-layer input for actian-ds-knowledge.
//
// Walks every node's boundVariables in the current file, resolves each
// referenced variable id to its STABLE library key (+ name/type/collection,
// informational), and hands the JSON to the UI for copy-paste into
// tokens/src/figma-variable-ids.json.
//
// Why a plugin: the REST variables endpoint is Enterprise-gated, but the
// Plugin API's getVariableByIdAsync is not — and the local VariableID:* ids
// it sees are the SAME ids the REST /nodes payloads carry in boundVariables,
// which is exactly the join the sync needs. Keys are stable across files;
// names are never used for matching downstream (key-based join only).

function collectAliasIds(value, out) {
  if (!value || typeof value !== "object") return;
  if (value.type === "VARIABLE_ALIAS" && typeof value.id === "string") {
    out[value.id] = true;
    return;
  }
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) collectAliasIds(value[i], out);
    return;
  }
  for (var k in value) collectAliasIds(value[k], out);
}

// Collect boundVariables from a page's whole subtree with a GUARDED manual
// walk (iterative, so a deep tree can't overflow the stack). We deliberately
// do NOT use node.findAll: it resolves every node's public type internally, and
// Figma throws "Internal Figma error: Unknown node type ... in
// getPublicNodeType" if the file contains a single node type this API version
// can't classify (a widget, section, or newer node) — aborting the WHOLE
// export. Reading boundVariables/children directly avoids that type resolution;
// the per-node try/catch skips only the one unreadable node (or its subtree),
// never the export.
function collectPageBoundVars(page, out) {
  var stack = [page];
  while (stack.length) {
    var node = stack.pop();
    if (!node) continue;
    try {
      if (node.boundVariables) collectAliasIds(node.boundVariables, out);
    } catch (e) {
      // this node's boundVariables are unreadable — skip it, keep walking
    }
    var kids = null;
    try {
      kids = node.children;
    } catch (e) {
      kids = null; // unreadable container — skip its subtree, not the page
    }
    if (kids && kids.length) {
      for (var i = 0; i < kids.length; i++) stack.push(kids[i]);
    }
  }
}

async function run() {
  await figma.loadAllPagesAsync();
  var idSet = {};
  var pages = figma.root.children;
  for (var p = 0; p < pages.length; p++) {
    try {
      collectPageBoundVars(pages[p], idSet);
    } catch (e) {
      // a whole page is unreadable — skip it, still export every other page
    }
  }

  var ids = {};
  var collectionNames = {};
  var sorted = Object.keys(idSet).sort();
  for (var i = 0; i < sorted.length; i++) {
    var id = sorted[i];
    try {
      var v = await figma.variables.getVariableByIdAsync(id);
      if (!v || typeof v.key !== "string" || !v.key) continue;
      var collection = null;
      try {
        if (v.variableCollectionId) {
          if (!(v.variableCollectionId in collectionNames)) {
            var c = await figma.variables.getVariableCollectionByIdAsync(
              v.variableCollectionId,
            );
            collectionNames[v.variableCollectionId] =
              c && c.name ? c.name : null;
          }
          collection = collectionNames[v.variableCollectionId];
        }
      } catch (e) {
        // collection name is informational only — never block the export
      }
      var entry = { key: v.key, name: v.name, resolvedType: v.resolvedType };
      if (collection) entry.collection = collection;
      ids[id] = entry;
    } catch (e) {
      // unresolvable id (deleted/no-access variable) — skip; the sync-side
      // join is tolerant and simply captures values-only for that binding.
    }
  }

  var payload = {
    _meta: {
      description:
        "Figma local-variable id -> stable library key map for the P2 name layer. Paste this file over tokens/src/figma-variable-ids.json.",
      generator: "scripts/figma-plugin (manual run in Figma)",
      auto_generated: false,
      fileName: figma.root.name,
      exportedAt: new Date().toISOString(),
      idCount: Object.keys(ids).length,
    },
    ids: ids,
  };

  figma.showUI(__html__, { width: 560, height: 460 });
  figma.ui.postMessage({
    type: "export",
    json: JSON.stringify(payload, null, 2),
  });
}

run().catch(function (e) {
  figma.notify("Export failed: " + (e && e.message ? e.message : e));
  figma.closePlugin();
});
