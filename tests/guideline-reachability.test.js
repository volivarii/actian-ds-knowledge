"use strict";

// Does authored guidance actually REACH a consumer?
//
// Consumers (docs site, plugin's component-brief) resolve a guideline by its
// REGISTRY key, not by its authoring slug. So a guideline whose slug is neither
// a registry component key nor the target of a registryAlias is derived,
// bundled, advertised in llms.txt, reported `approved` in coverage.md — and
// rendered by nobody. Nothing used to check this, which is exactly how it went
// unnoticed: on 2026-07-14 the docs site found 9 such slugs, and the plugin's
// component-brief had been silently GENERATING replacement guidance for Card
// and Tag family members while the real authored docs sat one directory over.
//
// Coverage that counts what was authored, rather than what reaches a reader,
// reports success for content nobody can see. This test closes that gap: an
// authored guideline must be reachable, or be named below with a reason.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const identity = require("../scripts/components/derive-identity.js");

const REPO_ROOT = path.resolve(__dirname, "..");

// Authored guidance that reaches no consumer today. Each entry needs a reason,
// because an unexplained entry here is the silent failure this test exists to
// prevent, just written down. Removing a slug from this list is the fix; adding
// one is a decision.
const UNREACHABLE = {
  "combo-box":
    "Authored ahead of Figma on purpose; no registry component exists yet to alias. See _notes.registry_aliases_interim.",
  "multi-select":
    "Authored ahead of Figma on purpose; no registry component exists yet to alias. See _notes.registry_aliases_interim.",
  "global-toast":
    "Never in the registry: Figma ships no toast component (the docs site maps the term to `notification` for links only). Either Figma gains a toast or this guidance should fold into `notification`.",
  "inline-toast": "Never in the registry, same as global-toast.",
  "success-state":
    "Never in the registry. `confirmation` (Figma: 'A placeholder shown when success') looks like its successor and carries its own authored guideline, so this doc is probably superseded and should be retired or merged.",
  "search-filters":
    "LEFT the registry in the 2026-07-23 breaking sync (was on the published '✅ Filters' page; its Figma key now maps to no slug, verified against the live DS v2.5.0 library, so this is a removal not a rename). Deleted vs merely-unpublished is indistinguishable from the registry, but either way it is unavailable to consumers. The authored guideline is kept guidance-only, like success-state; if it is republished the next sync restores the registry entry and this exception should be deleted.",
  "upload-file":
    "NEEDS A DESIGN DECISION. No 'Upload file' component exists in DS Kit, and none ever did. The `upload-file` key that sat in dskit.json until 2026-07-13 was an ICON glyph (page '✍️ Icons'), squatting the component slug under the old flat icon+component namespace; the icon-namespace split (#418) moved icons out, and that is what revealed this guidance has never had a component behind it. Only FM Kit (wireframes) has `upload`/`cloud-upload`. Unlike combo-box/multi-select this looks accidental rather than deliberate: its content is `approved`. Either the component gets built in Figma, or the guidance is retired.",
};

function readAuthoredSlugs() {
  const srcDir = path.join(REPO_ROOT, "components/src");
  return fs
    .readdirSync(srcDir)
    .filter((entry) => fs.existsSync(path.join(srcDir, entry, "_meta.yml")))
    .sort();
}

function readReachable() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "paths-manifest.json"), "utf8"),
  );
  const dskit = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, "components/dist/registries/dskit.json"),
      "utf8",
    ),
  );
  // Three ways to reach a consumer: BE a registry key, be the target of a
  // hand-written alias FROM one (how the card and tag family docs reach their
  // members), or be the target of a RENAME-INDUCED alias derived from the
  // identity ledger.
  //
  // The third exists because a rename leaves the authored directory behind:
  // Figma renames the component to `action-bar` while its guidance stays in
  // `components/src/sticky-footer/`. Without it this gate fails a required check
  // on every slug rename, and the only remedy would be hand-writing the alias
  // the ledger already knows, on a sync PR that is meant to auto-merge (#552).
  const registryKeys = new Set(Object.keys(dskit.components || {}));
  const aliasTargets = new Set(Object.values(manifest.registryAliases || {}));
  let ledger = null;
  try {
    ledger = JSON.parse(
      fs.readFileSync(
        path.join(REPO_ROOT, "components/dist/identity.json"),
        "utf8",
      ),
    );
  } catch (e) {
    ledger = null;
  }
  Object.values(
    identity.renameAliases(
      ledger,
      readAuthoredSlugs(),
      Array.from(registryKeys),
    ),
  ).forEach((target) => aliasTargets.add(target));
  return { registryKeys, aliasTargets };
}

test("every authored guideline reaches a consumer, or is a named exception", () => {
  const { registryKeys, aliasTargets } = readReachable();
  const orphans = readAuthoredSlugs().filter(
    (slug) => !registryKeys.has(slug) && !aliasTargets.has(slug),
  );

  const unnamed = orphans.filter((slug) => !(slug in UNREACHABLE));
  assert.deepEqual(
    unnamed,
    [],
    `Authored guidance that reaches nobody: ${unnamed.join(", ")}.\n` +
      `Each of these has a guideline that is derived, bundled and reported in coverage.md, ` +
      `but no consumer can render it, because the slug is neither a dskit.json component key ` +
      `nor the target of a paths-manifest.json#registryAliases entry.\n` +
      `Fix it (usually one alias line, as the card and tag families did) or add it to ` +
      `UNREACHABLE in this file with a reason.`,
  );
});

test("the unreachable list does not rot: every named exception is still unreachable", () => {
  const { registryKeys, aliasTargets } = readReachable();
  const nowReachable = Object.keys(UNREACHABLE).filter(
    (slug) => registryKeys.has(slug) || aliasTargets.has(slug),
  );

  assert.deepEqual(
    nowReachable,
    [],
    `These are listed as unreachable but now resolve: ${nowReachable.join(", ")}. ` +
      `Good news, and the reason to delete them from UNREACHABLE. A stale exception list ` +
      `is how a check stops meaning anything.`,
  );
});

test("every named exception is actually authored (no ghosts in the list)", () => {
  const authored = new Set(readAuthoredSlugs());
  const ghosts = Object.keys(UNREACHABLE).filter((slug) => !authored.has(slug));

  assert.deepEqual(
    ghosts,
    [],
    `Listed as unreachable but no longer authored at all: ${ghosts.join(", ")}. ` +
      `The guideline was retired; drop it from UNREACHABLE.`,
  );
});
