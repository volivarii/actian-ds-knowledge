// A record's connections: one count, a Map / List toggle, the selected link's
// panel. Styles live in styles/connections.css.
import React, { useId, useMemo, useState } from "react";
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
  onLinkMention?: (slug: string, text: string) => void;
  /** Shown instead of editing controls when set (e.g. YAML source open). */
  readOnlyReason?: string;
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
  const [picking, setPicking] = useState<{ start?: string } | null>(null);
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
    setPicking(null);
    setSel(sel === i.key ? null : i.key);
  };
  const total = countConnections(model);

  const canEdit = !!props.onEdit && !props.readOnlyReason;
  // "Must follow" writes one of three fields; the item's type picks it.
  const fieldFor = (g: ConnectionGroup, i: ConnectionItem) => g.owned.find((o) => o.type === i.type) ?? g.owned[0]!;
  const edit = (g: ConnectionGroup, i: ConnectionItem, op: "add" | "remove") => {
    const f = fieldFor(g, i);
    props.onEdit!([{ op, field: f.field, slug: i.slug, shape: f.shape }]);
  };
  const remove = (g: ConnectionGroup, i: ConnectionItem) => edit(g, i, "remove");
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
        <h2 id={titleId} className="cx-h">
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
        />
      )}
      <DraftBar model={model} file={props.file} onDiscard={canEdit ? props.onDiscard : undefined} />
    </section>
  );
}
