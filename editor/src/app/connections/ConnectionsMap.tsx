// Lanes around the record: what it links to on the left, what links to it on
// the right, one lane per kind. Connectors run from each lane to the record,
// never one per item, and carry no meaning of their own (aria-hidden).
import React, { useLayoutEffect, useRef, useState } from "react";
import type { ConnectionGroup, ConnectionsModel } from "../../lib/connections/types";
import { countConnections } from "../../lib/connections/build";
import { relationTypeLabel, relationTypeColor } from "../../lib/relationTypes";
import { GroupItems, GroupCount, StoreLine, type GroupViewProps } from "./ConnectionsList";

export function ConnectionsMap(props: GroupViewProps & { model: ConnectionsModel; onConnect?: () => void }) {
  const { model } = props;
  const outs = model.groups.filter((g) => g.direction === "out");
  const ins = model.groups.filter((g) => g.direction === "in");
  const total = countConnections(model);
  const mapRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<Array<{ d: string; here: boolean }>>([]);

  useLayoutEffect(() => {
    const draw = () => {
      const map = mapRef.current;
      const focus = map?.querySelector<HTMLElement>(".cx-focus");
      if (!map || !focus) return setPaths([]);
      // Stacked (narrow) layout: one column, no connectors.
      if (getComputedStyle(map).gridTemplateColumns.split(" ").length < 3) return setPaths([]);
      const m = map.getBoundingClientRect();
      const f = focus.getBoundingClientRect();
      if (!f.width) return setPaths([]);
      const fy = f.top + f.height / 2 - m.top;
      setPaths(
        [...map.querySelectorAll<HTMLElement>(".cx-lane")].map((l) => {
          const b = l.getBoundingClientRect();
          const left = b.right <= f.left;
          const x1 = (left ? b.right : b.left) - m.left;
          const y1 = b.top + Math.min(20, b.height / 2) - m.top;
          const x2 = (left ? f.left : f.right) - m.left;
          const mx = (x1 + x2) / 2;
          return { d: `M${x1},${y1} C${mx},${y1} ${mx},${fy} ${x2},${fy}`, here: l.classList.contains("cx-editable") };
        }),
      );
    };
    draw();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
    if (ro && mapRef.current) ro.observe(mapRef.current);
    return () => ro?.disconnect();
  }, [model, props.selectedKey]);

  const lane = (g: ConnectionGroup) => (
    <div key={g.key} className={`cx-lane${g.editable ? " cx-editable" : ""}`} role="group" aria-label={g.label}>
      <div className="cx-lh">
        <b>
          {g.label} <GroupCount group={g} />
        </b>
        <StoreLine group={g} />
      </div>
      <span className="cx-sub">{g.sentence}</span>
      <GroupItems {...props} group={g} cap={g.items.length > 40 ? 12 : 8} filterable={false} />
    </div>
  );

  return (
    <div className="cx-map" ref={mapRef}>
      <svg className="cx-wires" aria-hidden="true">
        {paths.map((p, i) => (
          <path key={i} d={p.d} className={p.here ? "cx-wire-here" : undefined} />
        ))}
      </svg>
      <div className="cx-col" role="group" aria-label={`${model.name} links to`}>
        <span className="cx-colhead">
          <b>{model.name}</b> links to
        </span>
        {outs.length ? outs.map(lane) : <span className="cx-sub">Nothing yet.</span>}
      </div>
      <div className="cx-focus" role="group" aria-label={`${model.name}, the record`}>
        <span className="cx-type">
          <span className="cx-dot" style={{ background: relationTypeColor(model.type) }} aria-hidden="true" />
          {relationTypeLabel(model.type)}
        </span>
        <b>{model.name}</b>
        <span className="cx-sub">
          {total} {total === 1 ? "connection" : "connections"}
        </span>
        {props.onConnect && (
          <button type="button" className="cx-btn" onClick={props.onConnect}>
            + Connect
          </button>
        )}
      </div>
      <div className="cx-col" role="group" aria-label={`Links to ${model.name}`}>
        <span className="cx-colhead">
          Links to <b>{model.name}</b>
        </span>
        {ins.length ? ins.map(lane) : <span className="cx-sub">Nothing yet.</span>}
      </div>
    </div>
  );
}
