// The one editing surface: the selected link in a plain sentence, where it is
// stored, and the actions its store allows.
import React, { useEffect, useRef, useState } from "react";
import type { ConnectionGroup, ConnectionItem, ConnectionsModel } from "../../lib/connections/types";
import { STORE_LABEL, fillOther } from "../../lib/connections/vocabulary";
import { relationTypeLabel } from "../../lib/relationTypes";

function whereItLives(g: ConnectionGroup, i: ConnectionItem, fileName: string): string {
  if (i.state === "added") return `Not saved yet. It goes into ${fileName}.`;
  if (i.state === "removed") return `Marked for removal from ${fileName}.`;
  if (i.state === "notInGraph" && g.store !== "here")
    return `${i.title} has guidance, but the graph has no record under that name, so this link isn't counted by the plugin or the docs.`;
  if (i.state === "notInGraph")
    return `Stored in ${fileName}, but the graph has no record named ${i.slug}, so the link goes nowhere.`;
  if (i.unlinked) return `The text names ${i.slug} in code style, so it isn't a link.`;
  switch (g.store) {
    case "here":
      return `This record, in ${fileName}.`;
    case "figma":
      return "The nightly sync brings changes here.";
    case "inherited":
      return `Stored on ${g.where}. Every component in it gets this rule.`;
    case "inferred":
      return "Not stored anywhere. The graph matches the term's name to this record.";
    case "structure":
      return "Follows the foundations tree.";
    case "text":
      return `A link in ${g.where}. Edit the sentence to change it.`;
    default:
      return `Stored on ${g.where}. Open ${i.title} to change it.`;
  }
}

export function ConnectionPanel(props: {
  model: ConnectionsModel;
  file: string;
  selected: { group: ConnectionGroup; item: ConnectionItem } | null;
  figma?: Map<string, string>;
  onOpen: (nodeId: string) => void;
  canOpen?: (nodeId: string) => boolean;
  actions?: React.ReactNode;
  readOnlyReason?: string;
  /** Present when the selected link is a ref this record stores: saves its note. */
  onNote?: (note: string) => void;
}) {
  if (!props.selected)
    return (
      <div className="cx-panel cx-idle" role="region" aria-label="Selected connection">
        Select a link to read it in plain words and see where it's stored.
        {props.readOnlyReason && <> {props.readOnlyReason}</>}
      </div>
    );
  const { group: g, item: i } = props.selected;
  const fileName = props.file.split("/").pop() ?? props.file;
  const figma = i.type === "component" && g.store === "figma" ? props.figma?.get(i.slug) : undefined;
  return (
    <div className="cx-panel" role="region" aria-label="Selected connection">
      <p className="cx-sentence">{fillOther(g.phrase, i.title)}</p>
      <dl className="cx-facts">
        {i.type !== "unknown" && (
          <>
            <dt>Kind</dt>
            <dd>{relationTypeLabel(i.type)}</dd>
          </>
        )}
        <dt>Where it's stored</dt>
        <dd>
          {STORE_LABEL[g.store]}. {whereItLives(g, i, fileName)}
        </dd>
        {!props.onNote && i.note && (
          <>
            <dt>Note</dt>
            <dd>{i.note}</dd>
          </>
        )}
      </dl>
      {props.onNote && <NoteBox key={i.key} note={i.note ?? ""} onSave={props.onNote} />}
      <div className="cx-actions">
        {props.actions}
        {i.reciprocal && <span className="cx-hint">The other record has it too: {i.reciprocal}</span>}
        {figma && (
          <a className="cx-btn cx-ghost" href={figma} target="_blank" rel="noreferrer">
            Open in Figma
          </a>
        )}
        {i.nodeId && (props.canOpen?.(i.nodeId) ?? true) && (
          <button type="button" className="cx-btn cx-ghost" onClick={() => props.onOpen(i.nodeId!)}>
            Open {i.title}
          </button>
        )}
      </div>
    </div>
  );
}

/** A ref's note. Follows the stored note whenever the author is not typing
 *  in it (Discard restores it), and saves on leaving the box, on Escape
 *  (which closes the panel) and if the box goes away while focused. */
function NoteBox(props: { note: string; onSave: (note: string) => void }) {
  const [text, setText] = useState(props.note);
  const focused = useRef(false);
  const latest = useRef({ text, note: props.note, onSave: props.onSave });
  latest.current = { text, note: props.note, onSave: props.onSave };
  const lastSaved = useRef<string | null>(null);
  const save = () => {
    const { text: t, note, onSave } = latest.current;
    if (t.trim() === note || t === lastSaved.current) return;
    lastSaved.current = t;
    onSave(t);
  };
  useEffect(() => {
    if (!focused.current) setText(props.note);
  }, [props.note]);
  useEffect(
    () => () => {
      if (focused.current) save();
    },
    [],
  );
  return (
    <label className="cx-note">
      <span>Note</span>
      <textarea
        rows={2}
        value={text}
        placeholder="Why this rule applies here (optional)"
        onFocus={() => {
          focused.current = true;
          lastSaved.current = null;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false;
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") save();
        }}
      />
    </label>
  );
}
