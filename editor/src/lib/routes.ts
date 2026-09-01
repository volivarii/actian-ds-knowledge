/**
 * Two-way map between the editor's `activePath` and the URL hash.
 *
 * The hash speaks the navigation's language rather than the repository's:
 * `#/component/button/content`, not `#/components/src/button/content.md`. That
 * is the whole point of it. An address gets pasted into Slack and has to keep
 * working, so it must not name a file layout that the page model will change.
 *
 * A hash fragment rather than a path because the editor is served from static
 * GitHub Pages with no `404.html`: a real path would 404 on a hard load of a
 * deep link, which is precisely the case the address exists to serve.
 *
 * Anything the table does not claim takes the `#/file/<repo path>` fallback, so
 * an unmapped file degrades to a working, ugly URL rather than resolving to the
 * wrong screen or to none. `tests/lib/routes.test.ts` walks the real corpus and
 * asserts the round trip and the absence of collisions, so a new domain shows
 * up as a failing test rather than as a link that quietly opens something else.
 */

import type { ExploreTab } from "../app/HomeScreen";

export const HOME_HASH = "#/";

export const PRODUCT_NAME = "Actian DS Knowledge Editor";

/** The home screen's data tabs. `coverage` is the default and stays
 *  unqualified, so the plain home address does not carry a tab nobody chose.
 *
 *  Deliberately NOT annotated `readonly ExploreTab[]`: that annotation widens
 *  the literals back to `ExploreTab`, which makes the Exclude below resolve to
 *  `Exclude<ExploreTab, ExploreTab>` and hold no matter what this array
 *  contains. The two checks are a compile-time join in both directions, so
 *  adding a tab in HomeScreen without adding it here breaks the build rather
 *  than dropping it from the address silently. */
const EXPLORE_TABS = [
  "coverage",
  "accessibility",
  "relationships",
  "patterns",
] as const;
export const DEFAULT_EXPLORE_TAB: ExploreTab = "coverage";
/** Nothing here that HomeScreen does not offer. */
type _TabsAreReal = (typeof EXPLORE_TABS)[number] extends ExploreTab
  ? true
  : never;
/** Nothing HomeScreen offers that is missing here. */
type _TabsCovered =
  Exclude<ExploreTab, (typeof EXPLORE_TABS)[number]> extends never
    ? true
    : never;
const _tabsAreReal: _TabsAreReal = true;
const _tabsCovered: _TabsCovered = true;
void _tabsAreReal;
void _tabsCovered;

/** `activePath` values that name a screen rather than a file. */
const SCREENS: ReadonlyArray<readonly [string, string]> = [
  ["inbox", "#/drafts"],
];

/**
 * A component's authorable files, by the segment that names each one.
 *
 * Closed on purpose. An unrecognised file inside a component folder takes the
 * raw-path fallback rather than being guessed into an extension: `tokens` is
 * `.yml` and `content` is `.md`, so a rule that inferred the extension would
 * round-trip one of them into a file that does not exist.
 */
const COMPONENT_DOMAINS: ReadonlyArray<readonly [string, string]> = [
  ["content", "content.md"],
  ["usage", "usage.md"],
  ["design", "design.md"],
  ["behavior", "behavior.md"],
  ["tokens", "tokens.yml"],
  ["meta", "_meta.yml"],
];

/**
 * One segment per section of the navigation, named as the sidebar names it.
 *
 * Two entries need their reason recorded. `app-context/src/patterns` is
 * `#/feature/` because the navigation calls those records Features, which is
 * also what keeps them from colliding with the content patterns. And
 * `app-context/src/apps` is `#/app/` because `#/product/` is taken by
 * `content/src/product`: the product has two sections a reader would call
 * Product, and the URL cannot.
 *
 * Ordered so `components/src/categories` is claimed before the component rule,
 * which would otherwise read `categories` as a component slug.
 */
const DIRS: ReadonlyArray<readonly [string, string]> = [
  ["category", "components/src/categories"],
  ["writing", "content/src/writing"],
  ["pattern", "content/src/patterns"],
  ["product", "content/src/product"],
  ["app", "app-context/src/apps"],
  ["entity", "app-context/src/entities"],
  ["feature", "app-context/src/patterns"],
  ["foundations", "foundations/src"],
  ["accessibility", "accessibility/src"],
  ["content", "content/src"],
];

/** The one definition of a workspace address. EditorShell imports it rather
 *  than keeping a second copy: a looser pattern here would mint addresses the
 *  dispatch refuses, which reads to a person as a link that goes nowhere. */
export const WORKSPACE_RE = /^workspace\/([a-z0-9][a-z0-9-]*)$/;
const COMPONENT_FILE_RE = /^components\/src\/([^/]+)\/([^/]+)$/;

/** Compiled once. `hashFor` runs on every navigation and again for every title,
 *  so building ten regexes per call is work with no reason. */
const DIR_MATCHERS: ReadonlyArray<readonly [string, RegExp]> = DIRS.map(
  ([segment, dir]) => [segment, new RegExp(`^${dir}/([^/]+)\\.md$`)] as const,
);

/** The hash for an `activePath`. `null` is the home screen, where the chosen
 *  data tab is the only thing left to address. */
export function hashFor(
  activePath: string | null,
  exploreTab: ExploreTab = DEFAULT_EXPLORE_TAB,
): string {
  if (activePath == null || activePath === "") {
    return exploreTab === DEFAULT_EXPLORE_TAB
      ? HOME_HASH
      : `#/explore/${exploreTab}`;
  }

  for (const [value, hash] of SCREENS) {
    if (activePath === value) return hash;
  }

  const ws = WORKSPACE_RE.exec(activePath);
  if (ws) return `#/component/${ws[1]}`;

  for (const [segment, matcher] of DIR_MATCHERS) {
    const m = matcher.exec(activePath);
    if (m) return `#/${segment}/${m[1]}`;
  }

  const cf = COMPONENT_FILE_RE.exec(activePath);
  if (cf) {
    const domain = COMPONENT_DOMAINS.find(([, file]) => file === cf[2]);
    if (domain) return `#/component/${cf[1]}/${domain[0]}`;
  }

  return `#/file/${activePath}`;
}

/** The `activePath` a hash names. `null` is the home screen, and is also what
 *  an unreadable hash resolves to: a link that no longer parses lands the
 *  reader somewhere real rather than on a blank pane. */
export function pathFromHash(hash: string): string | null {
  const body = hash.replace(/^#\/?/, "");
  if (body === "") return null;

  for (const [value, screenHash] of SCREENS) {
    if (hash === screenHash) return value;
  }

  const parts = body.split("/");
  const [head, ...rest] = parts;

  if (head === "file") return rest.join("/") || null;

  if (head === "component") {
    const [slug, domain] = rest;
    if (!slug) return null;
    if (rest.length === 1) return `workspace/${slug}`;
    if (rest.length === 2) {
      const match = COMPONENT_DOMAINS.find(([seg]) => seg === domain);
      return match ? `components/src/${slug}/${match[1]}` : null;
    }
    return null;
  }

  if (rest.length !== 1) return null;
  const dir = DIRS.find(([segment]) => segment === head);
  return dir ? `${dir[1]}/${rest[0]}.md` : null;
}

/** The home data tab a hash names, or `null` if it names none. */
export function exploreTabFromHash(hash: string): ExploreTab | null {
  const m = /^#\/explore\/([^/]+)$/.exec(hash);
  const tab = m?.[1];
  return tab && (EXPLORE_TABS as readonly string[]).includes(tab)
    ? (tab as ExploreTab)
    : null;
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** The document title for an `activePath`.
 *
 *  The name comes from the slug rather than the registry's display name,
 *  because the registry arrives asynchronously and a tab title that changes
 *  under the reader is worse than one that says "Data Product" instead of
 *  "Data product". */
export function titleFor(activePath: string | null): string {
  const hash = hashFor(activePath);
  const segments = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (segments.length === 0) return PRODUCT_NAME;

  const name =
    segments[0] === "file"
      ? titleCase(
          (segments[segments.length - 1] ?? "").replace(/\.(md|yml)$/, ""),
        )
      : titleCase(segments[1] ?? segments[0] ?? "");

  return name ? `${name} \u00b7 ${PRODUCT_NAME}` : PRODUCT_NAME;
}

/**
 * The whole screen an address names, read in one go.
 *
 * `App` seeds its state from this synchronously, during the first render, so
 * the app is never briefly on the wrong screen. An effect that read the address
 * after mount would have to be guarded against overwriting the deep link before
 * its navigation committed, and every run-count guard for that is defeated by
 * StrictMode's double mount, which is a development-only symptom of a design
 * that was correcting itself instead of starting correct.
 *
 * `exploreTab` is `null` only when the address names a file and so says nothing
 * about the tab. A home address always names one, falling back to the default,
 * so that going Back to plain `#/` restores the default tab rather than leaving
 * the tab strip showing something the address does not say.
 */
export function stateFromHash(hash: string): {
  activePath: string | null;
  exploreTab: ExploreTab | null;
} {
  const activePath = pathFromHash(hash);
  return {
    activePath,
    exploreTab:
      activePath === null
        ? (exploreTabFromHash(hash) ?? DEFAULT_EXPLORE_TAB)
        : null,
  };
}
