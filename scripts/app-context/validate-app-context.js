"use strict";
function validateAppContext(dist) {
  const errors = [];
  const entityKeys = new Set(Object.keys(dist.entities || {}));
  const appKeys = new Set(Object.keys(dist.apps || {}));
  for (const [slug, e] of Object.entries(dist.entities || {})) {
    for (const [verb, target] of Object.entries(e.relationships || {})) {
      if (!entityKeys.has(target)) errors.push(`entity "${slug}".relationships.${verb} → "${target}" is not an entity`);
    }
    for (const app of e.apps || []) if (!appKeys.has(app)) errors.push(`entity "${slug}".apps → "${app}" is not an app`);
  }
  for (const [slug, p] of Object.entries(dist.patterns || {})) {
    for (const app of p.apps || []) if (!appKeys.has(app)) errors.push(`pattern "${slug}".apps → "${app}" is not an app`);
  }
  return { errors: errors.sort() };
}
module.exports = { validateAppContext };
