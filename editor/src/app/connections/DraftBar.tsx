// Pending connection changes: how many, which file they go into, the lines
// they write, and a way back.
import React, { useState } from "react";
import type { ConnectionsModel } from "../../lib/connections/types";
import { pendingCount, pendingPreview } from "../../lib/connections/preview";

export function DraftBar(props: { model: ConnectionsModel; file: string; onDiscard?: () => void }) {
  const [show, setShow] = useState(false);
  const n = pendingCount(props.model);
  if (!n) return null;
  const lines = pendingPreview(props.model);
  const fileName = props.file.split("/").pop();
  return (
    <div className="cx-draft" role="status">
      <span>
        <b>
          {n} change{n > 1 ? "s" : ""} not saved yet.
        </b>{" "}
        They go into {fileName} with your other edits. The map shows them dashed until the pull request merges.
      </span>
      <span className="cx-actions">
        <button type="button" className="cx-btn cx-ghost" aria-expanded={show} onClick={() => setShow(!show)}>
          {show ? "Hide" : "Review"} the file change
        </button>
        {props.onDiscard && (
          <button type="button" className="cx-btn cx-ghost" onClick={props.onDiscard}>
            Discard
          </button>
        )}
      </span>
      {show && (
        <pre className="cx-diff" role="region" aria-label="File change">
          {props.file + "\n"}
          {lines.map((l, k) => (
            <span key={k} className={`cx-diff-${l.kind}`}>
              {(l.kind === "add" ? "+" : l.kind === "remove" ? "-" : " ") + "  ".repeat(l.indent) + l.text + "\n"}
            </span>
          ))}
        </pre>
      )}
    </div>
  );
}
