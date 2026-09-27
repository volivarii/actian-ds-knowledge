// One link as a button. Its state is always a word as well as a style, so
// colour is never the only signal, and the word is part of the accessible name.
import React from "react";
import type { ConnectionItem } from "../../lib/connections/types";
import { relationTypeColor } from "../../lib/relationTypes";

const STATE_WORD: Partial<Record<ConnectionItem["state"], string>> = {
  added: "new",
  removed: "removing",
  notInGraph: "not in graph",
};

export function ConnectionChip(props: {
  item: ConnectionItem;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const { item } = props;
  const word = item.unlinked ? "not linked" : STATE_WORD[item.state];
  return (
    <button
      type="button"
      className={`cx-chip cx-${item.state}${item.unlinked ? " cx-unlinked" : ""}`}
      aria-pressed={props.selected}
      data-ref={item.nodeId ? item.slug : undefined}
      onClick={props.onSelect}
      onKeyDown={(e) => {
        if ((e.key === "Delete" || e.key === "Backspace") && props.onRemove) {
          e.preventDefault();
          props.onRemove();
        }
      }}
    >
      <span className="cx-dot" style={{ background: relationTypeColor(item.type) }} aria-hidden="true" />
      <span className="cx-t">{item.title}</span>
      {item.reciprocal && (
        <span className="cx-flag" title="Both records have this link">
          ↔
        </span>
      )}
      {word && <span className="cx-flag">{word}</span>}
    </button>
  );
}
