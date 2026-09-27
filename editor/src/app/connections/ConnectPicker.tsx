// "+ Connect" in two steps: what kind of connection (only those this record
// stores), then which record, searched among the right node type only.
import React, { useMemo, useState } from "react";
import type { ConnectionEdit, ConnectionsModel, OwnedField } from "../../lib/connections/types";
import { graphNodes, graphEdges } from "../../substrate/taxonomyAssets";
import { excludedNodeIds } from "../../substrate/graphEligibility";
import { relationTypeLabel, relationTypeColor } from "../../lib/relationTypes";
import { cleanTitle } from "../../lib/referenceCard";
import { slugOfId } from "../../lib/connections/owned";

interface Candidate {
  id: string;
  title: string;
  type: string;
}

let excluded: Set<string> | null = null;
let categorised: Set<string> | null = null;
/** Graph nodes of the given types. Components are only those in a real
 *  category: icons, logos and illustrations are excluded like everywhere else. */
function candidates(types: string[]): Candidate[] {
  excluded ??= excludedNodeIds(graphNodes, graphEdges);
  categorised ??= new Set(graphEdges.filter((e) => e.type === "in_category").map((e) => e.source));
  return graphNodes
    .filter((n) => types.includes(n.type) && !excluded!.has(n.id) && (n.type !== "component" || categorised!.has(n.id)))
    .map((n) => ({ id: n.id, title: cleanTitle(n.title), type: n.type }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function ConnectPicker(props: {
  model: ConnectionsModel;
  /** A group key: skips step 1 (a lane's "+ Add"). */
  start?: string;
  onPick: (edit: ConnectionEdit) => void;
  onCancel: () => void;
}) {
  const [groupKey, setGroupKey] = useState<string | null>(props.start ?? null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const opt = props.model.connect.find((c) => c.groupKey === groupKey) ?? null;
  const list = useMemo(() => {
    if (!opt) return [];
    const present = new Set(
      props.model.groups
        .find((g) => g.key === opt.groupKey)
        ?.items.filter((i) => i.state !== "removed")
        .map((i) => i.nodeId) ?? [],
    );
    const needle = q.trim().toLowerCase();
    return candidates(opt.owned.map((o) => o.type))
      .filter((c) => !present.has(c.id) && c.id !== props.model.nodeId)
      .filter((c) => !needle || c.title.toLowerCase().includes(needle) || slugOfId(c.id).includes(needle))
      .slice(0, 8);
  }, [opt, q, props.model]);
  const pick = (c: Candidate) => {
    const f: OwnedField = opt!.owned.find((o) => o.type === c.type) ?? opt!.owned[0]!;
    props.onPick({ op: "add", field: f.field, slug: slugOfId(c.id), shape: f.shape });
  };

  if (!opt)
    return (
      <div className="cx-panel" role="region" aria-label="Connect">
        <p className="cx-sentence">
          Connect <b>{props.model.name}</b> to…
        </p>
        <span className="cx-hint">
          Step 1 of 2 · what kind of connection. Only connections stored in this record are listed.
        </span>
        <div className="cx-rels">
          {props.model.connect.map((c) => (
            <button key={c.groupKey} type="button" className="cx-rel" onClick={() => setGroupKey(c.groupKey)}>
              <b>{c.label}</b>
              <span>{c.sentence}</span>
            </button>
          ))}
        </div>
        <div className="cx-actions">
          <button type="button" className="cx-btn cx-ghost" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );

  const kinds = [...new Set(opt.owned.map((o) => relationTypeLabel(o.type).toLowerCase()))].join(" or ");
  const listId = `cx-opts-${opt.groupKey.replace(/[^a-z0-9-]/gi, "-")}`;
  return (
    <div className="cx-panel" role="region" aria-label="Connect">
      <p className="cx-sentence">
        <b>{props.model.name}</b> · {opt.label} · …
      </p>
      {!props.start && <span className="cx-hint">Step 2 of 2 · which record</span>}
      <input
        className="cx-search"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={list[active] ? `${listId}-${active}` : undefined}
        aria-label={`Find a ${kinds}`}
        placeholder={`Find a ${kinds}`}
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive(Math.min(active + 1, list.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive(Math.max(active - 1, 0));
          } else if (e.key === "Enter") {
            // Never submits the form the section may sit in, match or not.
            e.preventDefault();
            if (list[active]) pick(list[active]!);
          } else if (e.key === "Escape") {
            e.preventDefault();
            props.onCancel();
          }
        }}
      />
      <ul id={listId} role="listbox" className="cx-opts" aria-label={`Matching ${kinds}`}>
        {list.length === 0 && <li aria-disabled="true">No {kinds} matches “{q}”.</li>}
        {list.map((c, n) => (
          <li
            key={c.id}
            id={`${listId}-${n}`}
            role="option"
            aria-selected={n === active}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(c);
            }}
          >
            <span className="cx-dot" style={{ background: relationTypeColor(c.type) }} aria-hidden="true" />
            {c.title}
            <span className="cx-k">{relationTypeLabel(c.type)}</span>
          </li>
        ))}
      </ul>
      <div className="cx-actions">
        {!props.start && (
          <button type="button" className="cx-btn cx-ghost" onClick={() => setGroupKey(null)}>
            Back
          </button>
        )}
        <button type="button" className="cx-btn cx-ghost" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
