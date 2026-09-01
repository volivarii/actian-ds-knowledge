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
import {
  isMetaYaml,
  isPlainMarkdown,
} from "./wysiwygPaths";
import { matchFrontmatterForm } from "./frontmatterForms";

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
 * raw-path fallback rather than being guessed into an extension.
 *
 * `tokens` is absent deliberately. It is YAML-backed and the dispatch refuses
 * it, so an entry here would resolve an address to a screen that shows the
 * refusal banner, which is exactly what this module promises never to do. Add
 * it back the day tokens.yml becomes openable.
 */
const COMPONENT_DOMAINS: ReadonlyArray<readonly [string, string]> = [
  ["content", "content.md"],
  ["usage", "usage.md"],
  ["design", "design.md"],
  ["behavior", "behavior.md"],
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
export /**
 * The shape of every slug the app mints.
 *
 * BOTH directions check it. An address carrying anything else was not produced
 * by this app, so it resolves to home rather than to a path the dispatch will
 * refuse. And a file whose basename is not this shape gets no name, because a
 * name it could mint but not read back is worse than the fallback: the reader's
 * link would resolve to nothing and be silently replaced with home.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** The one definition of a workspace address. EditorShell imports it rather
 *  than keeping a second copy: a looser pattern here would mint addresses the
 *  dispatch refuses, which reads to a person as a link that goes nowhere. */
export const WORKSPACE_RE = /^workspace\/([a-z0-9][a-z0-9-]*)$/;

/** A repo-relative path that cannot escape the repository. `..` is rejected
 *  outright rather than resolved, because the browser collapses it before the
 *  request leaves: the path the editor displays and the file it would commit to
 *  would be different strings. */
function isSafeRepoPath(path: string): boolean {
  return (
    path !== "" &&
    !path.startsWith("/") &&
    !path.includes("//") &&
    !path.split("/").includes("..") &&
    !path.split("/").includes(".")
  );
}

/** True when the editor's dispatch will render an edit screen for this path.
 *  `hashFor` names only these, so an address is never minted for a file that
 *  answers with the refusal banner. */
function isOpenable(path: string): boolean {
  return (
    matchFrontmatterForm(path) != null ||
    isPlainMarkdown(path) ||
    isMetaYaml(path)
  );
}
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

  // Only a file the dispatch will actually open earns a named address. A name
  // is a promise that the link works for whoever receives it, and 17 files
  // (every tokens.yml, the AUTHORING and README notes) had one while rendering
  // the refusal banner.
  if (isOpenable(activePath)) {
    for (const [segment, matcher] of DIR_MATCHERS) {
      const m = matcher.exec(activePath);
      if (m && m[1] && SLUG_RE.test(m[1])) return `#/${segment}/${m[1]}`;
    }

    const cf = COMPONENT_FILE_RE.exec(activePath);
    if (cf && cf[1] && SLUG_RE.test(cf[1])) {
      const domain = COMPONENT_DOMAINS.find(([, file]) => file === cf[2]);
      if (domain) return `#/component/${cf[1]}/${domain[0]}`;
    }
  }

  return `#/file/${activePath}`;
}

/** The `activePath` a hash names. `null` is the home screen, and is also what
 *  an unreadable hash resolves to: a link that no longer parses lands the
 *  reader somewhere real rather than on a blank pane. */
export function pathFromHash(hash: string): string | null {
  // Normalise what real senders do to a link before validating it. A chat
  // client appending a slash, or an analytics wrapper appending a query, used
  // to resolve to home or to a file name with the query inside it, and in both
  // cases the write effect then overwrote the address the reader was sent.
  // Decoded for the same reason `sameAddress` decodes: what comes back from
  // `location.hash`, or out of an auto-linker, is the encoded form of what was
  // written. Without this a path with a space in it resolves to one containing
  // a literal %20.
  let body = hash
    .replace(/^#\/?/, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  try {
    body = decodeURIComponent(body);
  } catch {
    // A malformed escape is not an address this app minted.
    return null;
  }
  if (body === "") return null;

  const parts = body.split("/");
  const [head, ...rest] = parts;

  for (const [value, screenHash] of SCREENS) {
    if (`#/${head}` === screenHash && rest.length === 0) return value;
  }

  if (head === "file") {
    const path = rest.join("/");
    return isSafeRepoPath(path) ? path : null;
  }

  if (head === "component") {
    const [slug, domain] = rest;
    if (!slug || !SLUG_RE.test(slug)) return null;
    if (rest.length === 1) return `workspace/${slug}`;
    if (rest.length === 2) {
      const match = COMPONENT_DOMAINS.find(([seg]) => seg === domain);
      return match ? `components/src/${slug}/${match[1]}` : null;
    }
    return null;
  }

  if (rest.length !== 1) return null;
  const slug = rest[0];
  if (!slug || !SLUG_RE.test(slug)) return null;
  const dir = DIRS.find(([segment]) => segment === head);
  return dir ? `${dir[1]}/${slug}.md` : null;
}

/** The home data tab a hash names, or `null` if it names none. */
export function exploreTabFromHash(hash: string): ExploreTab | null {
  const normalised = hash.replace(/[?#](?!\/).*$/, "").replace(/\/+$/, "");
  const m = /^#\/explore\/([^/]+)$/.exec(normalised);
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

/**
 * The document title for a screen.
 *
 * Takes the tab as well as the path, because the home data views are
 * addressable and were otherwise all called "Actian DS Knowledge Editor", which
 * makes four distinct pages indistinguishable in the tab strip, in history and
 * in bookmarks. A component's domain is named too, for the same reason: an
 * author cross-referencing Content and Usage in two tabs could not tell them
 * apart.
 *
 * The name comes from the slug rather than the registry's display name, because
 * the registry arrives asynchronously and a tab title that changes under the
 * reader is worse than one that says "Data Product" instead of "Data product".
 */
export function titleFor(
  activePath: string | null,
  exploreTab: ExploreTab = DEFAULT_EXPLORE_TAB,
): string {
  const segments = hashFor(activePath, exploreTab)
    .replace(/^#\/?/, "")
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) return PRODUCT_NAME;

  const [head, second, third] = segments;
  let name: string;
  if (head === "file") {
    name = titleCase((segments[segments.length - 1] ?? "").replace(/\.(md|yml)$/, ""));
  } else if (segments.length === 1) {
    name = titleCase(head ?? "");
  } else if (head === "explore") {
    name = titleCase(second ?? "");
  } else {
    name = titleCase(second ?? "") + (third ? ` ${third}` : "");
  }

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
