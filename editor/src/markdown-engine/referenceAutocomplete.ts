// `[[` reference-autocomplete trigger for the Milkdown rich editor. Mounted
// as an EXTRA `.use()` in RichBodyEditor (MilkdownBody), never inside
// milkdownPreset.ts: it inserts a plain link (not a new node type or mark
// grammar), so it cannot affect round-trip serialization of files that never
// use it, and the round-trip drift guards stay untouched by construction.
//
// HAND-ROLLED trigger (the brief's fallback path). prosemirror-autocomplete
// 0.4.3 was tried first and REJECTED: it ships no `exports` field, so under
// Node (the test runner) its CJS entry loads a SECOND, CJS copy of
// prosemirror-state next to Milkdown's ESM copy, and editor.create() dies
// with "RangeError: Adding different instances of a keyed plugin (plugin$)"
// (two PluginKey registries independently minting the name "plugin$").
// Exactly the duplicate-prosemirror-state failure the fallback clause
// anticipated.
//
// Instead of input rules + meta bookkeeping, the plugin DERIVES its state on
// every transaction from the text before the caret: active iff the caret's
// textblock matches /\[\[query$/ ending exactly at the caret (and the
// selection is empty). Typing, backspacing, clicking away, and applying a
// pick all fall out of that one rule with no event plumbing; the only stored
// extra is a "dismissed" trigger position (set by Escape via transaction
// meta) so close() stays closed while the same `[[` run persists and re-arms
// once it is gone. All prosemirror imports come from @milkdown/prose/* so
// this module can never introduce a second prosemirror instance.
//
// Keyboard nav (arrows/Enter/Escape) is handled entirely by ReferencePicker
// via a document-level CAPTURE-phase keydown listener while the picker is
// open (see ReferencePicker.tsx). A capture-phase listener on `document`
// runs before the bubble-phase listener ProseMirror attaches directly to its
// contenteditable DOM node, so preventDefault + stopPropagation there
// reliably beat ProseMirror to the keystroke.
import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import type { EditorState } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import {
  searchReferenceTargets,
  type ReferenceTarget,
} from "../lib/referenceIndex";

export interface ReferencePickerState {
  query: string;
  /** Viewport coords for the popup anchor. */
  rect: { left: number; bottom: number };
  /** Replace the trigger range ("[[query") with the chosen target's link. */
  apply: (target: ReferenceTarget) => void;
  close: () => void;
}

// Module-level setter, same pattern as media/mediaNodeView.ts'
// setMediaPreviewSlug: the trigger plugin (registered once at editor
// creation) closes over this handler and calls it on every open/filter/close
// transition. RichBodyEditor registers/unregisters it per mount via an
// effect, same lifecycle as the media slug/octokit setters.
let currentHandler: ((s: ReferencePickerState | null) => void) | null = null;
export function setReferencePickerHandler(
  h: ((s: ReferencePickerState | null) => void) | null,
): void {
  currentHandler = h;
}

/** Replace the WHOLE trigger range (including the leading `[[`) with a plain
 *  link `target.label` -> `target.href`, using the link mark resolved at
 *  runtime from the live schema (avoids threading ctx into this module). */
export function insertReferenceLink(
  view: EditorView,
  range: { from: number; to: number },
  target: ReferenceTarget,
): void {
  const { state } = view;
  const linkType = state.schema.marks.link;
  if (!linkType) return; // defensive: commonmark preset always registers it
  const mark = linkType.create({ href: target.href });
  view.dispatch(
    state.tr.replaceWith(
      range.from,
      range.to,
      state.schema.text(target.label, [mark]),
    ),
  );
  view.focus();
}

/** `[[` then a query run: no `]` (a typed `]` abandons the trigger, like
 *  completing a real wiki link would), no nested `[`. Anchored at the end so
 *  only the run IMMEDIATELY before the caret triggers. */
const TRIGGER_RE = /\[\[([^\][\n]*)$/;

interface TriggerMatch {
  /** Doc position of the first `[` (start of the range to replace). */
  from: number;
  /** Doc position of the caret (end of the range to replace). */
  to: number;
  query: string;
}

/** The `[[query` run ending exactly at the caret, or null. A pure function
 *  of the editor state, so open/filter/close all derive from re-running it. */
function matchTrigger(state: EditorState): TriggerMatch | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;
  // Inline leaf nodes become \0, which the char class rejects, so a trigger
  // can never span across an inline atom (e.g. a <Media> chip).
  const before = $from.parent.textBetween(0, $from.parentOffset, "\0", "\0");
  const m = TRIGGER_RE.exec(before);
  if (!m) return null;
  return {
    from: selection.from - m[0].length,
    to: selection.from,
    query: m[1] ?? "",
  };
}

interface TriggerPluginState {
  match: TriggerMatch | null;
  /** `from` of a trigger dismissed via Escape: stays closed while that same
   *  `[[` run persists, re-arms once the match is gone. */
  dismissedAt: number | null;
}

const key = new PluginKey<TriggerPluginState>("actianReferenceAutocomplete");

/** Escape path: mark the current trigger dismissed (sticky until its `[[`
 *  run disappears). The picker clears itself via the close() that sent this. */
function dismiss(view: EditorView, match: TriggerMatch): void {
  view.dispatch(view.state.tr.setMeta(key, { dismiss: match.from }));
}

function emitToHandler(view: EditorView, match: TriggerMatch): void {
  if (!currentHandler) return;
  const handler = currentHandler;
  const coords = view.coordsAtPos(match.from);
  handler({
    query: match.query,
    rect: { left: coords.left, bottom: coords.bottom },
    apply: (target: ReferenceTarget) => {
      // Re-derive the range at apply time: the pick can land transactions
      // after this state was emitted, and a stale range would splice the
      // wrong span. Trigger already gone means the pick degrades to a close.
      const live = matchTrigger(view.state);
      if (live) insertReferenceLink(view, live, target);
      handler(null);
    },
    close: () => {
      const live = matchTrigger(view.state);
      if (live) dismiss(view, live);
      handler(null);
    },
  });
}

const triggerPlugin = new Plugin<TriggerPluginState>({
  key,
  state: {
    init: () => ({ match: null, dismissedAt: null }),
    apply(tr, prev, _oldState, newState): TriggerPluginState {
      const meta = tr.getMeta(key) as { dismiss?: number } | undefined;
      if (typeof meta?.dismiss === "number") {
        return { match: null, dismissedAt: meta.dismiss };
      }
      const match = matchTrigger(newState);
      if (!match) return { match: null, dismissedAt: null };
      if (prev.dismissedAt !== null && match.from === prev.dismissedAt) {
        return { match: null, dismissedAt: prev.dismissedAt };
      }
      return { match, dismissedAt: null };
    },
  },
  view() {
    return {
      // The view hook (not apply) emits to the handler: it runs after the
      // EditorView has painted the new state, so coordsAtPos is valid here.
      update(view, prevState) {
        const prev = key.getState(prevState)?.match ?? null;
        const next = key.getState(view.state)?.match ?? null;
        if (next) {
          // Open (prev null) or filter (query/position changed): re-emit so
          // the picker always sees the current query + caret coords.
          if (!prev || prev.from !== next.from || prev.query !== next.query) {
            emitToHandler(view, next);
          }
        } else if (prev) {
          currentHandler?.(null);
        }
      },
      destroy() {
        currentHandler?.(null);
      },
    };
  },
});

/** Milkdown plugin for the extra `.use()` in MilkdownBody. */
export const referenceAutocompletePlugin = $prose(() => triggerPlugin);

export { searchReferenceTargets };
export type { ReferenceTarget };
