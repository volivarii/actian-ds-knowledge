/**
 * Body search: what the header field finds when the phrase is in the guidance
 * rather than in a title.
 *
 * The corpus is generated at build time (scripts/gen-search-bodies.ts) and
 * arrives as its own lazily imported chunk, so the editor's cold load does not
 * carry 400 KB of prose that most sessions never search.
 *
 * A body result must open the exact file the phrase is in, which is why the
 * component rows address `#/component/<slug>/<domain>` rather than the
 * workspace: sending an author to the component and leaving them to guess which
 * of four documents holds the sentence is the same defect one level down.
 */
import { hashFor } from "./routes";
import type { AddressSegment } from "./routes";
import { humanizeSlug } from "./contentFiles";
import type { SearchItem, SearchKind } from "./searchIndex";

export interface SearchBodyDoc {
  /** Repo-relative source path — what `onOpenFile` receives. */
  path: string;
  /** Searchable text, original case (see lib/searchBodyText). */
  text: string;
}

export interface SearchBodyFile {
  _meta: { auto_generated: true; source: string; do_not_edit: true };
  docs: SearchBodyDoc[];
}

/**
 * Which kind of thing each addressable section holds.
 *
 * `satisfies Record<Exclude<AddressSegment, …>, SearchKind>` is a join in both
 * directions: a new section in the address table that nobody classified here
 * fails the build, and a key here that names no real segment fails too. That
 * matters because the failure it prevents is silent — an unclassified segment
 * would simply never appear in results, which reads as "search is broken"
 * rather than as an error.
 *
 * `file` is excluded because it is the fallback for what the editor cannot
 * open, and `category` because category records are not in the title index
 * either; making them findable by body text alone would mean typing a
 * category's own name finds nothing while a sentence inside it does.
 */
const KIND_FOR_SEGMENT = {
  component: "component",
  foundations: "foundation",
  accessibility: "accessibility",
  app: "app-context",
  entity: "app-context",
  "ux-pattern": "app-context",
  writing: "content",
  pattern: "content",
  product: "content",
  content: "content",
} as const satisfies Record<
  Exclude<AddressSegment, "file" | "category">,
  SearchKind
>;

const KIND_BY_SEGMENT: Record<string, SearchKind | undefined> =
  KIND_FOR_SEGMENT;

/** One searchable document, ready to match: the row it becomes, plus the text
 *  and its lower-cased twin (computed once per load, not once per keystroke). */
export interface BodyEntry {
  item: SearchItem;
  text: string;
  lower: string;
}

/** `#/component/button/content` -> ["component", "button", "content"]. */
function addressParts(path: string): string[] {
  return hashFor(path).replace(/^#\//, "").split("/");
}

/**
 * What search offers for a source path, or `null` when it offers nothing.
 *
 * The generator filters on this too, rather than on its own idea of the same
 * thing. Before that it kept every addressable file, so six category records
 * were walked, normalised and shipped in the chunk that every searching author
 * downloads, and then dropped here — bytes nobody could ever get a row from,
 * with the generator's own log line reporting them as kept.
 */
export function searchKindForPath(path: string): SearchKind | null {
  const [segment, slug] = addressParts(path);
  if (!segment || !slug) return null;
  return KIND_BY_SEGMENT[segment] ?? null;
}

function domainLabel(segment: string): string {
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

/**
 * The rows a generated corpus can produce.
 *
 * `titled` is the existing title index, joined on path so a document that
 * already has a name keeps it rather than being re-derived from its filename.
 * `authorable` scopes components the same way the title index does, so search
 * cannot offer a component the sidebar will not show.
 */
export function bodyEntries(
  docs: readonly SearchBodyDoc[],
  authorable: ReadonlySet<string>,
  titled: readonly SearchItem[] = [],
): BodyEntry[] {
  const byPath = new Map(titled.map((i) => [i.path, i]));
  const componentTitle = new Map(
    titled
      .filter((i) => i.kind === "component")
      .map((i) => [i.path.replace(/^workspace\//, ""), i.title]),
  );

  const out: BodyEntry[] = [];
  for (const doc of docs) {
    const kind = searchKindForPath(doc.path);
    if (!kind) continue;
    const [segment, slug, domain] = addressParts(doc.path);
    if (!slug) continue;

    let item: SearchItem;
    const known = byPath.get(doc.path);
    if (known) {
      item = { ...known };
    } else if (segment === "component") {
      // A component's guidance file: named for the component, subtitled with
      // the document, so two rows from the same component are distinguishable.
      if (!authorable.has(slug)) continue;
      if (!domain) continue;
      item = {
        title: componentTitle.get(slug) ?? humanizeSlug(slug),
        kind,
        path: doc.path,
        sub: domainLabel(domain),
      };
    } else {
      item = { title: humanizeSlug(slug), kind, path: doc.path };
    }
    out.push({ item, text: doc.text, lower: doc.text.toLowerCase() });
  }
  return out;
}

const SNIPPET_LEAD = 40;
const SNIPPET_MAX = 140;

/**
 * The matched phrase in its sentence, so the author can see WHY a row is here.
 *
 * Without it a search for a phrase written in 24 files returns 24 bare
 * component names, which is the same "looks broken" the empty dropdown was.
 */
export function bodySnippet(
  entry: Pick<BodyEntry, "text" | "lower">,
  query: string,
): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const at = entry.lower.indexOf(q);
  if (at < 0) return null;

  let start = Math.max(0, at - SNIPPET_LEAD);
  // Start at a word boundary, but never past the match itself.
  if (start > 0) {
    const space = entry.text.indexOf(" ", start);
    if (space >= 0 && space < at) start = space + 1;
  }
  const body = entry.text.slice(start, start + SNIPPET_MAX);
  const trimmed = body.length < entry.text.length - start ? body + "…" : body;
  return (start > 0 ? "…" : "") + trimmed;
}

let pending: Promise<SearchBodyDoc[]> | null = null;

/**
 * The generated corpus, as its own chunk, fetched at most once per session.
 *
 * A failure REJECTS rather than resolving empty. An empty corpus and a corpus
 * that never arrived produce the same silent "no matches", and that is the
 * defect this whole module exists to remove: the caller has to be able to tell
 * the author that the guidance was not searched. The cache is cleared on the
 * way out so a later component instance can try again.
 */
export function loadSearchBodies(): Promise<SearchBodyDoc[]> {
  pending ??= import("../generated/search-bodies.json")
    .then((m) => (m.default as SearchBodyFile).docs)
    .catch((err: unknown) => {
      pending = null;
      throw err;
    });
  return pending;
}
