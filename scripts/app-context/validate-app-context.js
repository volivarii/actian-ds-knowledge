"use strict";
function validateAppContext(dist) {
  const errors = [];
  const entityKeys = new Set(Object.keys(dist.entities || {}));
  const appKeys = new Set(Object.keys(dist.apps || {}));
  for (const [slug, e] of Object.entries(dist.entities || {})) {
    for (const [verb, value] of Object.entries(e.relationships || {})) {
      // A verb carries a LIST of targets. A bare string is still read rather
      // than skipped: skipping would make an old-shaped record validate clean
      // while its targets went unchecked, which is the silent pass this file
      // exists to prevent.
      const targets = Array.isArray(value) ? value : [value];
      for (const target of targets) {
        if (!entityKeys.has(target))
          errors.push(
            `entity "${slug}".relationships.${verb} → "${target}" is not an entity`,
          );
      }
    }
    for (const app of e.apps || [])
      if (!appKeys.has(app))
        errors.push(`entity "${slug}".apps → "${app}" is not an app`);
    // The domain-model-to-design-system join. Both halves matter, and the
    // second is the one a reviewer cannot eyeball: a pattern that exists but
    // runs in a different app than the entity is a plausible-looking edge that
    // no screen can ever realise (an administration-only entity shown by a
    // studio-only pattern). Same rule the app.useCases check below applies,
    // and for the same reason.
    for (const pat of e.patterns || []) {
      const p = (dist.patterns || {})[pat];
      if (!p) {
        errors.push(`entity "${slug}".patterns → "${pat}" is not a pattern`);
      } else if (
        !(p.apps || []).some((app) => (e.apps || []).includes(app))
      ) {
        errors.push(
          `entity "${slug}".patterns → "${pat}" shares no app with the entity` +
            ` (entity: ${(e.apps || []).join("/") || "none"};` +
            ` pattern: ${(p.apps || []).join("/") || "none"})`,
        );
      }
    }
  }
  for (const [slug, p] of Object.entries(dist.patterns || {})) {
    for (const app of p.apps || [])
      if (!appKeys.has(app))
        errors.push(`pattern "${slug}".apps → "${app}" is not an app`);
  }
  // Personas: each listed app must exist, and the label is the join key an
  // audience resolves through, so two personas cannot share one.
  const personas = dist.personas || {};
  const personaSlugsByLabel = new Map();
  for (const [slug, p] of Object.entries(personas)) {
    for (const app of p.apps || [])
      if (!appKeys.has(app))
        errors.push(`persona "${slug}".apps → "${app}" is not an app`);
    const slugs = personaSlugsByLabel.get(p.label) || [];
    slugs.push(slug);
    personaSlugsByLabel.set(p.label, slugs);
  }
  for (const [label, slugs] of personaSlugsByLabel) {
    if (slugs.length > 1)
      errors.push(
        `persona label "${label}" is used by more than one persona (${slugs.join(", ")})`,
      );
  }
  for (const [slug, a] of Object.entries(dist.apps || {})) {
    for (const useCase of a.useCases || []) {
      for (const pat of useCase.patterns || []) {
        const p = (dist.patterns || {})[pat];
        if (!p) {
          errors.push(
            `app "${slug}".useCases → pattern "${pat}" does not exist`,
          );
        } else if (!(p.apps || []).includes(slug)) {
          errors.push(
            `app "${slug}".useCases → pattern "${pat}" is not scoped to app "${slug}"`,
          );
        }
      }
      // The persona join. Both halves, for the reason the pattern scope check
      // above has both: a persona that exists but works elsewhere is a
      // plausible-looking audience no screen in this app can serve.
      for (const label of useCase.audience || []) {
        const owners = personaSlugsByLabel.get(label) || [];
        if (owners.length === 0) {
          errors.push(
            `app "${slug}".useCases → audience "${label}" is not a persona`,
          );
        } else if (
          !owners.some((s) => (personas[s].apps || []).includes(slug))
        ) {
          errors.push(
            `app "${slug}".useCases → audience "${label}" is not scoped to app "${slug}"`,
          );
        }
      }
    }
  }
  return { errors: errors.sort() };
}
module.exports = { validateAppContext };
