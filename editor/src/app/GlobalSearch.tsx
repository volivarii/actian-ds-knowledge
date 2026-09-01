// Header search: an input plus a grouped results popover. Fed a SearchItem[]
// index (cross-domain, from lib/searchIndex) and the app's CommandItem[] as an
// "Actions" group. Selecting a row either opens a file (onOpenFile) or runs an
// action's own run(). Rows commit on mousedown so the click lands before the
// input's blur handler closes the popover.
import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import type { Ref, KeyboardEvent } from "react";
import { Box, Text } from "@radix-ui/themes";
import {
  searchCorpus,
  type SearchItem,
  type SearchKind,
} from "../lib/searchIndex";
import {
  bodyEntries,
  loadSearchBodies,
  type SearchBodyDoc,
} from "../lib/searchBodies";
import type { CommandItem } from "./CommandPalette";
import { relationTypeColor } from "../lib/relationTypes";

const KIND_LABEL: Record<SearchKind, string> = {
  component: "Components",
  foundation: "Foundations",
  content: "Content",
  accessibility: "Accessibility",
  "app-context": "App context",
};
// SearchKind -> a relationTypes key, so chips/dots reuse the editor's typed palette.
const KIND_COLOR: Record<SearchKind, string> = {
  component: relationTypeColor("component"),
  foundation: relationTypeColor("foundation_section"),
  content: relationTypeColor("content_topic"),
  accessibility: relationTypeColor("a11y_criterion"),
  "app-context": relationTypeColor("app"),
};

interface Row {
  key: string;
  label: string;
  color: string;
  chip: string;
  snippet?: string;
  run: () => void;
}

export interface GlobalSearchProps {
  index: SearchItem[];
  /** The authorable component slugs, so a body result cannot offer a component
   *  the sidebar will not show. Same set `buildSearchIndex` is given. */
  authorable: ReadonlySet<string>;
  actions: CommandItem[];
  onOpenFile: (path: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  /** How the body corpus is fetched. Production leaves it out and takes the
   *  lazily imported chunk; a test passes its own so it can assert that
   *  nothing is fetched until the author engages with the field. */
  loadBodies?: () => Promise<readonly SearchBodyDoc[]>;
}

export function GlobalSearch({
  index,
  authorable,
  actions,
  onOpenFile,
  inputRef,
  loadBodies = loadSearchBodies,
}: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // -1 = nothing pre-selected: with multiple groups it's possible for more
  // than one row to match (e.g. a component and an a11y criterion both
  // titled "Modal(s)"), so starting at 0 would make the first ArrowDown
  // skip row 0 and land on row 1 instead of highlighting the first result.
  const [active, setActive] = useState(-1);
  const hostRef = useRef<HTMLDivElement>(null);

  // The corpus is ~316 KB of prose. It arrives as its own chunk the first time
  // the author engages with the field, so a session that never searches never
  // pays for it, and one that does pays once.
  const [docs, setDocs] = useState<readonly SearchBodyDoc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [engaged, setEngaged] = useState(false);
  // The PROMISE is what is cached, not a "have we started" flag. With a flag,
  // any second run of this effect — a caller passing an inline `loadBodies`, a
  // StrictMode double mount — first runs the cleanup that sets `cancelled`,
  // then returns early on the flag, so nothing ever calls setDocs and the
  // popover reads "Searching the guidance…" for the rest of the session.
  // Re-subscribing to the same promise is idempotent, which a flag is not.
  const inflight = useRef<Promise<readonly SearchBodyDoc[]> | null>(null);
  useEffect(() => {
    if (!engaged || docs) return;
    let cancelled = false;
    (inflight.current ??= loadBodies()).then(
      (d) => {
        if (!cancelled) setDocs(d);
      },
      (err: unknown) => {
        console.warn("[search] guidance index did not load; titles only", err);
        inflight.current = null;
        if (!cancelled) {
          setDocs([]);
          setFailed(true);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [engaged, docs, loadBodies]);
  const loadingDocs = engaged && docs === null;

  // Rebuilt when the title index changes, because that is where the names come
  // from: entries built before the component list arrived would be named after
  // their filenames for the rest of the session.
  const bodies = useMemo(
    () => (docs ? bodyEntries(docs, authorable, index) : []),
    [docs, authorable, index],
  );

  const { groups, rows } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows: Row[] = [];
    const groups: { heading: string; rows: Row[] }[] = [];
    const acts = actions.filter((a) => !q || a.label.toLowerCase().includes(q));
    if (acts.length) {
      const g = { heading: "Actions", rows: [] as Row[] };
      for (const a of acts) {
        const r: Row = {
          key: `a:${a.id}`,
          label: a.label,
          color: "var(--gray-8)",
          chip: "Action",
          run: () => a.run(),
        };
        g.rows.push(r);
        rows.push(r);
      }
      groups.push(g);
    }
    for (const grp of searchCorpus(index, query, 6, bodies)) {
      const g = { heading: KIND_LABEL[grp.kind], rows: [] as Row[] };
      for (const it of grp.items) {
        const r: Row = {
          key: `${grp.kind}:${it.path}`,
          label: it.title,
          color: KIND_COLOR[grp.kind],
          chip: it.sub ?? KIND_LABEL[grp.kind].replace(/s$/, ""),
          snippet: it.snippet,
          run: () => onOpenFile(it.path),
        };
        g.rows.push(r);
        rows.push(r);
      }
      groups.push(g);
    }
    return { groups, rows };
  }, [query, index, actions, onOpenFile, bodies]);

  const runAt = useCallback(
    (i: number) => {
      const r = rows[i];
      if (!r) return;
      r.run();
      setOpen(false);
      setQuery("");
      // Reset the highlight: clearing the query reshapes the row list, so a
      // leftover index would point past the end and make the next bare Enter a
      // silent no-op (rows[stale] is undefined).
      setActive(-1);
    },
    [rows],
  );

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      // Clamp the upper bound too (not just >= 0), so a stale index from a
      // shrunken list still lands on a real row.
      setActive((a) => Math.max(Math.min(a - 1, rows.length - 1), 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // active starts at -1 (nothing pre-selected, see the state comment
      // above); fall through to the top hit so Enter opens a result even
      // when the author never pressed ArrowDown first.
      if (rows.length) runAt(active >= 0 ? active : 0);
    } else if (e.key === "Escape") {
      setOpen(false);
      (e.target as HTMLElement).blur();
    }
  };

  let flat = -1;
  return (
    <Box
      ref={hostRef}
      onBlur={(e) => {
        if (!hostRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
      style={{
        position: "relative",
        flexGrow: 1,
        maxWidth: 520,
        margin: "0 auto",
      }}
    >
      <input
        ref={inputRef}
        value={query}
        placeholder="Search components, guidance, foundations, products…"
        aria-label="Search the design system"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setEngaged(true);
        }}
        onKeyDown={onKeyDown}
        style={{
          width: "100%",
          height: 34,
          padding: "0 12px",
          borderRadius: 8,
          border: "1px solid var(--gray-6)",
          background: "var(--gray-2)",
          color: "var(--gray-12)",
          font: "inherit",
          fontSize: 14,
          outline: "none",
        }}
      />
      {/* An empty dropdown reads as a broken field rather than an empty one:
          the whole of finding F2 was a query that matched nothing and said
          nothing. So the popover opens whenever there is a query, and answers
          either with rows or with why there are none. */}
      {open && (rows.length > 0 || query.trim() !== "") && (
        <Box
          role={rows.length > 0 ? "listbox" : undefined}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "var(--color-panel-solid)",
            border: "1px solid var(--gray-5)",
            borderRadius: 8,
            boxShadow: "var(--shadow-4)",
            maxHeight: "60vh",
            overflowY: "auto",
            zIndex: 30,
          }}
        >
          {rows.length === 0 && (
            <Box role="status" style={{ padding: "12px 14px" }}>
              <Text as="div" size="2" style={{ color: "var(--gray-12)" }}>
                {loadingDocs
                  ? "Searching the guidance\u2026"
                  : `No matches for \u201c${query.trim()}\u201d`}
              </Text>
              {!loadingDocs && (
                // What was actually searched. Saying "titles and guidance
                // text" after the index failed to load would be the same
                // empty-looking answer to a broken question that this panel
                // exists to replace, one layer down.
                <Text as="div" size="1" color="gray" style={{ marginTop: 2 }}>
                  {failed
                    ? "Titles only \u2014 the guidance index did not load."
                    : "Search covers titles and guidance text."}
                </Text>
              )}
            </Box>
          )}
          {groups.map((g) => (
            <Box key={g.heading}>
              <Text
                as="div"
                size="1"
                color="gray"
                style={{
                  padding: "10px 14px 4px",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                }}
              >
                {g.heading}
              </Text>
              {g.rows.map((r) => {
                flat += 1;
                const i = flat;
                return (
                  <Box
                    key={r.key}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      runAt(i);
                    }}
                    style={{
                      padding: "8px 14px",
                      cursor: "pointer",
                      background:
                        i === active ? "var(--gray-3)" : "transparent",
                      borderLeft: `2px solid ${i === active ? "var(--accent-9)" : "transparent"}`,
                    }}
                  >
                    <Box
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: "50%",
                          background: r.color,
                          flex: "none",
                        }}
                      />
                      <Text size="2" style={{ color: "var(--gray-12)" }}>
                        {r.label}
                      </Text>
                      <Text size="1" color="gray" style={{ marginLeft: "auto" }}>
                        {r.chip}
                      </Text>
                    </Box>
                    {r.snippet && (
                      // Why this row is here. Indented under the label, past
                      // the dot and its gap.
                      <Text
                        as="div"
                        size="1"
                        color="gray"
                        style={{
                          marginLeft: 19,
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.snippet}
                      </Text>
                    )}
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
