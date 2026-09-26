// A record's connections: one count, a Map / List toggle, the selected link's
// panel. Styles live in styles/connections.css.
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ConnectionEdit, ConnectionGroup, ConnectionItem, ConnectionsModel } from "../../lib/connections/types";
import { countConnections } from "../../lib/connections/build";
import { ConnectionsList } from "./ConnectionsList";
import { ConnectionsMap } from "./ConnectionsMap";
import { ConnectionPanel } from "./ConnectionPanel";
import { ConnectPicker } from "./ConnectPicker";
import { DraftBar } from "./DraftBar";

export interface ConnectionsSectionProps {
  model: ConnectionsModel;
  /** Repo path of the file an edit writes, shown in the panel. */
  file: string;
  /** Open another record by node id. */
  onOpen: (nodeId: string) => void;
  /** Whether a record can be opened (some node kinds have no page). Default: yes. */
  canOpen?: (nodeId: string) => boolean;
  /** Figma URLs by component slug. */
  figma?: Map<string, string>;
  /** Present on editable surfaces. */
  onEdit?: (edits: ConnectionEdit[]) => void;
  onDiscard?: () => void;
  /** Saves the note on a ref this record stores. */
  onNote?: (field: string[], slug: string, note: string) => void;
  onLinkMention?: (slug: string, text: string) => void;
  /** Shown instead of editing controls when set (e.g. YAML source open). */
  readOnlyReason?: string;
  /** An edit that did not save, said out loud. */
  error?: string;
}

type View = "map" | "list";
const VIEW_KEY = "editor:connections-view";
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "map";
  } catch {
    return "map";
  }
}

export function ConnectionsSection(props: ConnectionsSectionProps) {
  const { model } = props;
  const titleId = useId();
  const [view, setView] = useState<View>(readView);
  const [sel, setSel] = useState<string | null>(null);
  const [picking, setPickingState] = useState<{ start?: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Keyboard users keep their place: closing the picker returns focus to what
  // opened it, and an edit that removes the focused chip (an added one
  // removed) moves focus to the section heading instead of the page.
  const opener = useRef<HTMLElement | null>(null);
  const editedFrom = useRef<Element | null>(null);
  const setPicking = (p: { start?: string } | null) => {
    if (p && !picking) opener.current = document.activeElement as HTMLElement | null;
    setPickingState(p);
  };
  useEffect(() => {
    if (picking || !opener.current) return;
    const back = opener.current;
    opener.current = null;
    (back.isConnected ? back : headingRef.current)?.focus();
  }, [picking]);
  useEffect(() => {
    const from = editedFrom.current;
    editedFrom.current = null;
    if (from && !from.isConnected) headingRef.current?.focus();
  }, [model]);
  const selected = useMemo(() => {
    for (const g of model.groups) for (const i of g.items) if (i.key === sel) return { group: g, item: i };
    return null;
  }, [model, sel]);
  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage blocked: the choice lasts for this page only */
    }
  };
  const onSelect = (_g: ConnectionGroup, i: ConnectionItem) => {
    // Choosing a chip closes the picker without sending focus back to its opener.
    opener.current = null;
    setPicking(null);
    setSel(sel === i.key ? null : i.key);
  };
  const total = countConnections(model);

  const canEdit = !!props.onEdit && !props.readOnlyReason;
  // "Must follow" writes one of three fields; the item's type picks it.
  const fieldFor = (g: ConnectionGroup, i: ConnectionItem) => g.owned.find((o) => o.type === i.type) ?? g.owned[0]!;
  const edit = (g: ConnectionGroup, i: ConnectionItem, op: "add" | "remove") => {
    const f = fieldFor(g, i);
    editedFrom.current = document.activeElement;
    props.onEdit!([{ op, field: f.field, slug: i.slug, shape: f.shape }]);
  };
  const remove = (g: ConnectionGroup, i: ConnectionItem) => edit(g, i, "remove");
  const noteFor = (s: typeof selected) => {
    if (!s || !canEdit || !props.onNote || !s.group.editable || s.item.state === "removed") return undefined;
    const f = fieldFor(s.group, s.item);
    if (f.shape !== "ref") return undefined;
    return (note: string) => props.onNote!(f.field, s.item.slug, note);
  };
  // Undo reverses a pending item: an addition is removed, a removal added back.
  const undo = (g: ConnectionGroup, i: ConnectionItem) => edit(g, i, i.state === "added" ? "remove" : "add");
  const actions =
    selected && canEdit && selected.group.editable ? (
      selected.item.state === "added" || selected.item.state === "removed" ? (
        <button type="button" className="cx-btn cx-ghost" onClick={() => undo(selected.group, selected.item)}>
          Undo
        </button>
      ) : (
        <button type="button" className="cx-btn cx-danger" onClick={() => remove(selected.group, selected.item)}>
          Remove
        </button>
      )
    ) : null;
  const viewProps = {
    groups: model.groups,
    selectedKey: sel,
    onSelect,
    onRemove: canEdit ? remove : undefined,
    onAdd: canEdit ? (g: ConnectionGroup) => setPicking({ start: g.key }) : undefined,
  };
  const connect = canEdit && model.connect.length > 0 ? () => setPicking({}) : undefined;

  return (
    <section
      className="cx"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          setSel(null);
          setPicking(null);
        }
      }}
    >
      <div className="cx-head">
        <h2 id={titleId} className="cx-h" ref={headingRef} tabIndex={-1}>
          Connections
        </h2>
        <span className="cx-sum">
          {total} in {model.groups.length} {model.groups.length === 1 ? "kind" : "kinds"}
        </span>
        <div className="cx-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "map"} onClick={() => choose("map")}>
            Map
          </button>
          <button type="button" aria-pressed={view === "list"} onClick={() => choose("list")}>
            List
          </button>
        </div>
        {connect && view === "list" && (
          <button type="button" className="cx-btn" onClick={connect}>
            + Connect
          </button>
        )}
      </div>
      {props.readOnlyReason && <span className="cx-hint">{props.readOnlyReason}</span>}
      {props.error && (
        <p className="cx-error" role="alert">
          {props.error}
        </p>
      )}
      {view === "map" ? (
        <ConnectionsMap model={model} {...viewProps} onConnect={connect} />
      ) : (
        <ConnectionsList {...viewProps} />
      )}
      {picking ? (
        <ConnectPicker
          model={model}
          start={picking.start}
          onPick={(e) => {
            props.onEdit!([e]);
            setPicking(null);
          }}
          onCancel={() => setPicking(null)}
        />
      ) : (
        <ConnectionPanel
          model={model}
          file={props.file}
          selected={selected}
          figma={props.figma}
          onOpen={props.onOpen}
          canOpen={props.canOpen}
          actions={actions}
          onNote={noteFor(selected)}
        />
      )}
      <DraftBar model={model} file={props.file} onDiscard={canEdit ? props.onDiscard : undefined} />
    </section>
  );
}
