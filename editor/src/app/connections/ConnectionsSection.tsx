// A record's connections: one count, a Map / List toggle, the selected link's
// panel. Styles live in styles/connections.css.
import React, { useMemo, useState } from "react";
import type { ConnectionEdit, ConnectionGroup, ConnectionItem, ConnectionsModel } from "../../lib/connections/types";
import { countConnections } from "../../lib/connections/build";
import { ConnectionsList } from "./ConnectionsList";
import { ConnectionPanel } from "./ConnectionPanel";

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
  const [view, setView] = useState<View>(readView);
  const [sel, setSel] = useState<string | null>(null);
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
  const onSelect = (_g: ConnectionGroup, i: ConnectionItem) => setSel(sel === i.key ? null : i.key);
  const total = countConnections(model);
  return (
    <section
      className="cx"
      aria-labelledby="cx-title"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) setSel(null);
      }}
    >
      <div className="cx-head">
        <h2 id="cx-title" className="cx-h">
          Connections
        </h2>
        <span className="cx-sum">
          {total} in {model.groups.length} kinds
        </span>
        <div className="cx-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "map"} onClick={() => choose("map")}>
            Map
          </button>
          <button type="button" aria-pressed={view === "list"} onClick={() => choose("list")}>
            List
          </button>
        </div>
      </div>
      <ConnectionsList groups={model.groups} selectedKey={sel} onSelect={onSelect} />
      <ConnectionPanel
        model={model}
        file={props.file}
        selected={selected}
        figma={props.figma}
        onOpen={props.onOpen}
        canOpen={props.canOpen}
        readOnlyReason={props.readOnlyReason}
      />
    </section>
  );
}
