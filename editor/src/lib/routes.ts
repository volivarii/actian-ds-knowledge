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

import {
  isMetaYaml,
  isPlainMarkdown,
} from "./wysiwygPaths";
import { matchFrontmatterForm } from "./frontmatterForms";

export const HOME_HASH = "#/";

/** The component tree. Named once: the address table's dir list, the component
 *  file matcher and the corpus walk all mean this same directory. */
const COMPONENT_DIR = "components/src";
const COMPONENT_SEGMENT = "component";
const FILE_SEGMENT = "file";

export const PRODUCT_NAME = "Actian DS Knowledge Editor";


/** `activePath` values that name a screen rather than a file. */
const SCREENS: ReadonlyArray<readonly [string, string]> = [
  ["inbox", "#/drafts"],
  // The overview on top of each scope's tree. These were four tabs beneath the
  // home screen, which forced four unrelated things into one shape (statistics,
  // chips restating the statistics, a table) and left the switcher below the
  // fold, so changing lens scrolled the reader back to the top. They are
  // screens now, and home is free to be a hub.
  ["coverage", "#/coverage"],
  ["accessibility", "#/accessibility"],
  ["patterns", "#/patterns"],
  // Orphans, edge counts and the graph are not scoped to anything: they are
  // diagnostics over the whole substrate, so the name says so.
  ["health", "#/health"],
];

/**
 * Addresses this app used to mint, mapped to the screen that replaced them.
 *
 * `#/explore/<tab>` was the home screen with a tab selected. Those links are in
 * people's history and in chat threads, and resolving them to home would land a
 * reader on a page that no longer contains what they were sent to. Read-only:
 * nothing mints these any more, and `hashFor` never returns one.
 */
const LEGACY_EXPLORE: ReadonlyArray<readonly [string, string]> = [
  ["coverage", "coverage"],
  ["accessibility", "accessibility"],
  ["patterns", "patterns"],
  ["relationships", "health"],
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
 * One segment per section of the navigation, named as the navigation names it.
 *
 * Two entries have a segment that is not their label, for the same reason.
 * `app-context/src/apps` is `#/app/` because `#/product/` is taken by
 * `content/src/product`. And `app-context/src/patterns` is `#/ux-pattern/`
 * even though the navigation calls those records Patterns, because
 * `#/pattern/` has named `content/src/patterns` since before this table
 * existed and is a published address (see CHANGELOG). Two sections a reader
 * would call Patterns, and the URL cannot have both.
 *
 * The segment does not have to match the label — the address is a permanent
 * identifier, the label is copy. What it must never do is CHANGE OCCUPANT: a
 * previously-shared `#/pattern/forms` has to keep opening the file it named,
 * and no alias can restore it once another directory claims the segment.
 *
 * Ordered so `components/src/categories` is claimed before the component rule,
 * which would otherwise read `categories` as a component slug.
 */
const DIRS = [
  ["category", "components/src/categories"],
  ["writing", "content/src/writing"],
  ["pattern", "content/src/patterns"],
  ["product", "content/src/product"],
  ["app", "app-context/src/apps"],
  ["entity", "app-context/src/entities"],
  ["ux-pattern", "app-context/src/patterns"],
  ["foundations", "foundations/src"],
  ["accessibility", "accessibility/src"],
  ["content", "content/src"],
] as const satisfies ReadonlyArray<readonly [string, string]>;

/**
 * Addresses this app no longer MINTS but must still RESOLVE.
 *
 * MIGRATIONS.md Rule 1, parallel change: a link pasted into Slack before the
 * rename has to keep opening the record it named. Read by `pathFromHash` only,
 * never by `hashFor`, so nothing new is minted with a retired segment and the
 * two tables cannot drift into minting an address the resolver would send
 * somewhere else.
 */
const RETIRED_DIRS: ReadonlyArray<readonly [string, string]> = [
  // The editor called app-context patterns "Features" until 2026-09-02.
  ["feature", "app-context/src/patterns"],
];

/**
 * Every segment an address can start with.
 *
 * `as const satisfies` above, rather than an annotation: the annotation widens
 * the literals back to `string`, which would make this type `string` and let
 * anything that reads it claim to be exhaustive while covering nothing. That is
 * the same widening that made the explore-tab check hold for any contents.
 */
export type AddressSegment =
  | (typeof DIRS)[number][0]
  | typeof COMPONENT_SEGMENT
  | typeof FILE_SEGMENT;

/**
 * The directories the address table names, which is also the set worth reading
 * for anything that wants the addressable corpus (the search body index walks
 * exactly these). Derived from the table rather than restated beside it, so a
 * new section cannot be addressable and unsearchable at the same time.
 */
export const ADDRESSED_DIRS: readonly string[] = [
  ...new Set([COMPONENT_DIR, ...DIRS.map(([, dir]) => dir)]),
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
const COMPONENT_FILE_RE = new RegExp(`^${COMPONENT_DIR}/([^/]+)/([^/]+)$`);

/** Compiled once. `hashFor` runs on every navigation and again for every title,
 *  so building ten regexes per call is work with no reason. */
const DIR_MATCHERS: ReadonlyArray<readonly [string, RegExp]> = DIRS.map(
  ([segment, dir]) => [segment, new RegExp(`^${dir}/([^/]+)\\.md$`)] as const,
);

/** The hash for an `activePath`. `null` is the home screen, where the chosen
 *  data tab is the only thing left to address. */
export function hashFor(activePath: string | null): string {
  if (activePath == null || activePath === "") return HOME_HASH;

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

  if (head === "explore" && rest.length === 1) {
    const legacy = LEGACY_EXPLORE.find(([tab]) => tab === rest[0]);
    return legacy ? legacy[1] : null;
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
  const dir =
    DIRS.find(([segment]) => segment === head) ??
    RETIRED_DIRS.find(([segment]) => segment === head);
  return dir ? `${dir[1]}/${slug}.md` : null;
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
export function titleFor(activePath: string | null): string {
  const segments = hashFor(activePath)
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
 * Every overview is a screen of its own, so an address names a screen and
 * nothing else. While the overviews were tabs on this screen, the address had
 * to carry the tab too, and going Back to plain `#/` had to be taught to
 * restore the default tab rather than leave the strip showing something the
 * address did not say.
 */
export function stateFromHash(hash: string): {
  activePath: string | null;
} {
  return { activePath: pathFromHash(hash) };
}
