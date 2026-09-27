// The list view, and the pieces the map shares with it: a group's store line
// and its capped, optionally filterable run of chips.
import React, { useState } from "react";
import type { ConnectionGroup, ConnectionItem } from "../../lib/connections/types";
import { STORE_LABEL } from "../../lib/connections/vocabulary";
import { ConnectionChip } from "./ConnectionChip";

export interface GroupViewProps {
  groups: ConnectionGroup[];
  selectedKey: string | null;
  onSelect: (group: ConnectionGroup, item: ConnectionItem) => void;
  onRemove?: (group: ConnectionGroup, item: ConnectionItem) => void;
  onAdd?: (group: ConnectionGroup) => void;
}

export function StoreLine({ group }: { group: ConnectionGroup }) {
  return <span className={`cx-store${group.store === "here" ? " cx-here" : ""}`}>{STORE_LABEL[group.store]}</span>;
}

export function countedItems(group: ConnectionGroup): number {
  return group.items.filter((i) => i.state !== "removed" && !i.unlinked).length;
}

export function GroupItems(props: GroupViewProps & { group: ConnectionGroup; cap: number; filterable: boolean }) {
  const { group } = props;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const all = q ? group.items.filter((i) => i.title.toLowerCase().includes(q.toLowerCase())) : group.items;
  const shown = open ? all : all.slice(0, props.cap);
  const canEdit = group.editable && !!props.onRemove;
  return (
    <div className="cx-items">
      {props.filterable && group.items.length > 24 && (
        <input
          className="cx-filter"
          aria-label={`Filter ${group.items.length} ${group.label.toLowerCase()}`}
          placeholder={`Filter ${group.items.length}`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
        />
      )}
      {shown.map((i) => (
        <ConnectionChip
          key={i.key}
          item={i}
          selected={props.selectedKey === i.key}
          onSelect={() => props.onSelect(group, i)}
          onRemove={canEdit && i.state !== "removed" ? () => props.onRemove!(group, i) : undefined}
        />
      ))}
      {all.length > props.cap && (
        <button type="button" className="cx-more" onClick={() => setOpen(!open)}>
          {open ? "Show fewer" : `+${all.length - props.cap} more`}
        </button>
      )}
      {group.editable && props.onAdd && (
        <button type="button" className="cx-add" onClick={() => props.onAdd!(group)}>
          + Add
        </button>
      )}
    </div>
  );
}

export function ConnectionsList(props: GroupViewProps) {
  return (
    <div className="cx-list">
      {props.groups.map((g) => (
        <div key={g.key} className="cx-row" role="group" aria-label={`${g.label}, ${countedItems(g)}`}>
          <div className="cx-glabel">
            <b>
              {g.label} <span className="cx-count">{countedItems(g)}</span>
            </b>
            <span className="cx-sub">{g.sentence}</span>
            <StoreLine group={g} />
          </div>
          <GroupItems {...props} group={g} cap={g.items.length > 40 ? 24 : 30} filterable />
        </div>
      ))}
    </div>
  );
}
