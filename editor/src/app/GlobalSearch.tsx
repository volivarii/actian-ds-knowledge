// Header search: an input plus a grouped results popover. Fed a SearchItem[]
// index (cross-domain, from lib/searchIndex) and the app's CommandItem[] as an
// "Actions" group. Selecting a row either opens a file (onOpenFile) or runs an
// action's own run(). Rows commit on mousedown so the click lands before the
// input's blur handler closes the popover.
import { useMemo, useRef, useState, useCallback } from "react";
import type { Ref, KeyboardEvent } from "react";
import { Box, Text } from "@radix-ui/themes";
import {
  searchCorpus,
  type SearchItem,
  type SearchKind,
} from "../lib/searchIndex";
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
  run: () => void;
}

export interface GlobalSearchProps {
  index: SearchItem[];
  actions: CommandItem[];
  onOpenFile: (path: string) => void;
  inputRef?: Ref<HTMLInputElement>;
}

export function GlobalSearch({
  index,
  actions,
  onOpenFile,
  inputRef,
}: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // -1 = nothing pre-selected: with multiple groups it's possible for more
  // than one row to match (e.g. a component and an a11y criterion both
  // titled "Modal(s)"), so starting at 0 would make the first ArrowDown
  // skip row 0 and land on row 1 instead of highlighting the first result.
  const [active, setActive] = useState(-1);
  const hostRef = useRef<HTMLDivElement>(null);

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
    for (const grp of searchCorpus(index, query)) {
      const g = { heading: KIND_LABEL[grp.kind], rows: [] as Row[] };
      for (const it of grp.items) {
        const r: Row = {
          key: `${grp.kind}:${it.path}`,
          label: it.title,
          color: KIND_COLOR[grp.kind],
          chip: it.sub ?? KIND_LABEL[grp.kind].replace(/s$/, ""),
          run: () => onOpenFile(it.path),
        };
        g.rows.push(r);
        rows.push(r);
      }
      groups.push(g);
    }
    return { groups, rows };
  }, [query, index, actions, onOpenFile]);

  const runAt = useCallback(
    (i: number) => {
      const r = rows[i];
      if (!r) return;
      r.run();
      setOpen(false);
      setQuery("");
    },
    [rows],
  );

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(active);
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
        onFocus={() => setOpen(true)}
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
      {open && rows.length > 0 && (
        <Box
          role="listbox"
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
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 14px",
                      cursor: "pointer",
                      background:
                        i === active ? "var(--gray-3)" : "transparent",
                      borderLeft: `2px solid ${i === active ? "var(--accent-9)" : "transparent"}`,
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
                );
              })}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
