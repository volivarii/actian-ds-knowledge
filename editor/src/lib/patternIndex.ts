// The app-first index over app-context patterns and captured page recipes.
//
// The substrate models three linkages and this file joins them so the editor
// can show them rather than restate them:
//
//   pattern -> apps          a many-to-many claim carried on the pattern
//   app -> useCase -> patterns   the app's own authored jobs, per audience
//   recipe -> pattern + app + derivedFrom.surface   a capture of a real page
//
// There is no flow concept in the substrate: flows belong to the plugin. The
// nearest true thing to a flow here is a use case (a job an audience does) and
// the surface path a capture was taken from.
//
// Every join reports what it could NOT resolve rather than dropping it. A
// pattern named by a use case that does not exist, and a capture naming a
// pattern that does not exist, are both findings for the reader, and a join
// that silently drops them is the failure this repo keeps re-learning.

import type { Octokit } from "@octokit/rest";
import { listFilesByGlob, getTextFile } from "../app/githubApi";

export const APP_CONTEXT_PATH = "app-context/dist/app-context.json";
export const RECIPES_DIR = "app-context/dist/recipes";

/**
 * Where a correction to a recipe goes. Distinct from RECIPES_DIR on purpose:
 * the editor READS the generated copy and must aim every edit at the authored
 * one, and two hand-written copies of that path is how one of them quietly
 * starts pointing at a 404.
 */
export const RECIPES_SRC_DIR = "app-context/src/recipes";
export const recipeSrcPath = (slug: string) => `${RECIPES_SRC_DIR}/${slug}.json`;

// ---------------------------------------------------------------- input shapes

export interface SidebarEntry {
  label: string;
  id: string;
}

export interface UseCaseRecord {
  audience?: string[];
  jobs?: string[];
  patterns?: string[];
}

export interface AppRecord {
  label?: string;
  purpose?: string;
  sidebar?: SidebarEntry[];
  useCases?: UseCaseRecord[];
  /** The audiences this product serves, as authored under `## Users`. */
  users?: string[];
  /**
   * Routing keywords, NOT prose: "steward", "govern", "curate", "lineage".
   * These are the words that mean "you want Studio" — the same job Pattern
   * `tags` does. The field name reads like UI feedback and is not that.
   */
  signals?: string[];
}

/** An entity property is either a bare name or a typed declaration. Slots only
 *  count them, so the union stays loose on purpose. */
export type EntityProperty =
  | string
  | { name: string; type?: string; states?: string[] };

export interface EntityRecord {
  label?: string;
  properties?: EntityProperty[];
  /**
   * Verb -> entity slugs. The verbs are OPEN (`contains`, `belongsTo`,
   * `relatesTo`, `subtypeOf`, `derivedFrom`, `uses`, `requires`, `produces`,
   * `consumes`, `appliesTo`), so this is a map and never a union: a parse keyed
   * to a closed lowercase verb list read 11 of the 30 records as having
   * relationships when 22 do, because 16 of them use camelCase verbs.
   */
  relationships?: Record<string, string[]>;
  apps?: string[];
  description?: string;
}

export interface TermRecord {
  /** The word to use. */
  use?: string;
  meaning?: string;
  /** The words to avoid in its place. */
  notUse?: string[];
}

export interface PatternRecord {
  label?: string;
  apps?: string[];
  tags?: string[];
  when?: string;
  components?: string[];
  description?: string;
}

export interface AppContextDoc {
  apps: Record<string, AppRecord>;
  patterns: Record<string, PatternRecord>;
  /**
   * Optional on the TYPE because `buildPatternIndex`'s fixtures do not carry
   * them; the real file always does, which `tests/lib/appContextDoc.test.ts`
   * asserts against the file rather than against the type. Both collections
   * were carried by app-context.json from the day it shipped and declared by
   * nothing, so no consumer could reach them.
   */
  entities?: Record<string, EntityRecord>;
  terminology?: Record<string, TermRecord>;
}

export interface RecipeDoc {
  slug: string;
  label?: string;
  apps?: string[];
  patterns?: string[];
  description?: string;
  when?: string;
  tags?: string[];
  derivedFrom?: {
    surface?: string;
    capturedOn?: string;
    productVersion?: string;
  };
  /** Named regions of the page, each described in prose rather than geometry. */
  slots?: Record<string, string>;
  renderNotes?: string[];
  /**
   * The captured FRAME/TEXT/INSTANCE tree, carried RAW. Reading it as an
   * outline is `recipeSkeleton.ts`; PAINTING it needs the plugin's
   * render-node.js and is deliberately not attempted here.
   */
  skeleton?: { chrome?: unknown; appHeader?: unknown; content?: unknown };
}

// --------------------------------------------------------------- output shapes

/** One named region of a captured page, described in prose. */
export interface RecipeSlot {
  name: string;
  description: string;
}

export interface PatternRecipe {
  slug: string;
  label: string | null;
  apps: string[];
  /** The patterns this capture declares, kept so an unresolved name stays visible. */
  names: string[];
  surface: string | null;
  capturedOn: string | null;
  productVersion: string | null;
  description: string | null;
  when: string | null;
  tags: string[];
  /**
   * The reviewable body. Lists are always lists, never undefined: the reader
   * maps over them, and three of the four recipes on disk predate some of
   * these fields.
   */
  slots: RecipeSlot[];
  renderNotes: string[];
  /** Raw, walked into an outline only when a reader opens the capture. */
  skeleton: RecipeDoc["skeleton"] | null;
}

export interface PatternRow {
  slug: string;
  label: string;
  apps: string[];
  tags: string[];
  when: string | null;
  description: string | null;
  components: string[];
  recipes: PatternRecipe[];
}

export interface AppUseCase {
  audience: string[];
  jobs: string[];
  patterns: PatternRow[];
  /** Names this use case lists that no pattern answers to. */
  missingPatterns: string[];
}

export interface AppSection {
  slug: string;
  label: string;
  sidebar: SidebarEntry[];
  useCases: AppUseCase[];
  /** Claimed by this app, named by none of its use cases. */
  unreachedPatterns: PatternRow[];
}

export interface PatternIndex {
  apps: AppSection[];
  patterns: PatternRow[];
  /**
   * Captures that name at least one pattern which does not exist, with those
   * names. Reported per NAME rather than per recipe: a capture naming one real
   * pattern and one typo resolves through the real one, and reporting only
   * fully-unresolved captures would drop the typo exactly the way this file's
   * header says a join must not.
   */
  recipesNamingMissingPatterns: { recipe: PatternRecipe; missing: string[] }[];
  /**
   * Captures that declare no pattern at all. A different finding from the one
   * above, and conflating them prints an empty list after an arrow.
   */
  recipesNamingNoPattern: PatternRecipe[];
  /** Patterns claiming an app the context does not define. */
  patternsClaimingUnknownApps: { pattern: string; apps: string[] }[];
  /**
   * The parsed source document, kept so a caller measuring Entities, Products
   * and Terms does not fetch and parse the same file a second time. The index
   * itself only needs apps and patterns; the other two collections are in the
   * same file and there is no second request to make for them.
   */
  doc: AppContextDoc;
  /**
   * False when the recipes directory could not be listed.
   *
   * `loadRecipes` returns [] for a failed listing, which was harmless while
   * captures were only chips on a row. As a MEASURE it is a lie with a number
   * on it: a rate limit or a transient 5xx makes every `captureCount` zero and
   * the dashboard reports "Capture 0 of 31" with nothing said. The Component
   * Capture Slot already drops out when its index cannot be read; without this
   * flag the two halves of one model behave differently on the same failure.
   */
  recipesReadable: boolean;
}

// --------------------------------------------------------------------- joining

function byLabel<T extends { label: string }>(a: T, b: T): number {
  return a.label.localeCompare(b.label);
}

function toRecipe(doc: RecipeDoc): PatternRecipe {
  return {
    slug: doc.slug,
    label: doc.label ?? null,
    apps: doc.apps ?? [],
    names: doc.patterns ?? [],
    surface: doc.derivedFrom?.surface ?? null,
    capturedOn: doc.derivedFrom?.capturedOn ?? null,
    productVersion: doc.derivedFrom?.productVersion ?? null,
    description: doc.description ?? null,
    when: doc.when ?? null,
    tags: doc.tags ?? [],
    // Insertion order, which is authoring order: the slots read top to bottom
    // down the captured page, and sorting them alphabetically would scramble
    // the one thing their sequence tells a reader.
    slots: Object.entries(doc.slots ?? {}).map(([name, description]) => ({
      name,
      description,
    })),
    renderNotes: doc.renderNotes ?? [],
    skeleton: doc.skeleton ?? null,
  };
}

export function buildPatternIndex(
  ctx: AppContextDoc,
  recipeDocs: RecipeDoc[],
  recipesReadable = true,
): PatternIndex {
  const patternSlugs = new Set(Object.keys(ctx.patterns ?? {}));
  const recipes = (recipeDocs ?? []).map(toRecipe);

  const rows = new Map<string, PatternRow>();
  for (const [slug, rec] of Object.entries(ctx.patterns ?? {})) {
    rows.set(slug, {
      slug,
      label: rec.label ?? slug,
      apps: rec.apps ?? [],
      tags: rec.tags ?? [],
      when: rec.when ?? null,
      description: rec.description ?? null,
      components: rec.components ?? [],
      recipes: recipes
        .filter((r) => r.names.includes(slug))
        .sort((a, b) => a.slug.localeCompare(b.slug)),
    });
  }

  const appSlugs = new Set(Object.keys(ctx.apps ?? {}));

  const apps: AppSection[] = Object.entries(ctx.apps ?? {})
    .map(([slug, rec]) => {
      const reached = new Set<string>();
      const useCases: AppUseCase[] = (rec.useCases ?? []).map((uc) => {
        const named = uc.patterns ?? [];
        const resolved: PatternRow[] = [];
        const missing: string[] = [];
        for (const name of named) {
          const row = rows.get(name);
          if (row) {
            resolved.push(row);
            reached.add(name);
          } else {
            missing.push(name);
          }
        }
        return {
          audience: uc.audience ?? [],
          jobs: uc.jobs ?? [],
          patterns: resolved,
          missingPatterns: missing,
        };
      });

      const unreached = [...rows.values()]
        .filter((p) => p.apps.includes(slug) && !reached.has(p.slug))
        .sort(byLabel);

      return {
        slug,
        label: rec.label ?? slug,
        sidebar: rec.sidebar ?? [],
        useCases,
        unreachedPatterns: unreached,
      };
    })
    .sort(byLabel);

  const recipesNamingMissingPatterns = recipes
    .map((recipe) => ({
      recipe,
      missing: recipe.names.filter((n) => !patternSlugs.has(n)),
    }))
    .filter((e) => e.missing.length > 0)
    .sort((a, b) => a.recipe.slug.localeCompare(b.recipe.slug));

  const recipesNamingNoPattern = recipes
    .filter((r) => r.names.length === 0)
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const patternsClaimingUnknownApps = [...rows.values()]
    .map((p) => ({
      pattern: p.slug,
      apps: p.apps.filter((a) => !appSlugs.has(a)),
    }))
    .filter((e) => e.apps.length > 0)
    .sort((a, b) => a.pattern.localeCompare(b.pattern));

  return {
    apps,
    patterns: [...rows.values()].sort(byLabel),
    recipesNamingMissingPatterns,
    recipesNamingNoPattern,
    patternsClaimingUnknownApps,
    doc: ctx,
    recipesReadable,
  };
}

// --------------------------------------------------------------------- loading

/** Read every captured page recipe. A directory that cannot be listed yields none. */
export async function loadRecipes(gh: Octokit): Promise<RecipeDoc[]> {
  return (await loadRecipesChecked(gh)).docs;
}

/** As `loadRecipes`, but says whether the DIRECTORY could be listed at all.
 *  A caller turning captures into a number needs to tell "no captures" from
 *  "could not look". */
export async function loadRecipesChecked(
  gh: Octokit,
): Promise<{ docs: RecipeDoc[]; readable: boolean }> {
  let files: string[];
  try {
    files = await listFilesByGlob(gh, RECIPES_DIR, { extension: ".json" });
  } catch {
    return { docs: [], readable: false };
  }
  const docs: RecipeDoc[] = [];
  for (const f of files) {
    try {
      const text = await getTextFile(gh, `${RECIPES_DIR}/${f}`);
      const json = JSON.parse(text) as RecipeDoc;
      docs.push({ ...json, slug: json.slug ?? f.replace(/\.json$/, "") });
    } catch {
      // A capture that cannot be read is not a capture that does not exist, but
      // the index has nothing to show for it either; the unclaimed list stays
      // the place a join failure surfaces.
    }
  }
  return { docs, readable: true };
}

export async function loadPatternIndex(gh: Octokit): Promise<PatternIndex> {
  const [ctxText, recipes] = await Promise.all([
    getTextFile(gh, APP_CONTEXT_PATH),
    loadRecipesChecked(gh),
  ]);
  const ctx = JSON.parse(ctxText) as AppContextDoc;
  return buildPatternIndex(ctx, recipes.docs, recipes.readable);
}
