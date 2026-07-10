import { EditorView } from "@codemirror/view";

/** Apply an externally produced full-document replacement to whichever
 *  editing surface is live: dispatch through the CodeMirror view when one
 *  exists (source mode, keeps undo history + editor state in sync), else
 *  fall back to the mode-agnostic text handler (rich mode, where `view` is
 *  never set because RichBodyEditor's Milkdown surface owns the body only;
 *  the fallback routes the change through the same setText/saveText path
 *  CodeMirror's onChange uses, so it is not silently dropped). */
export function applyExternalTextChange(
  view: EditorView | null,
  next: string,
  fallback: (next: string) => void,
): void {
  if (view) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
    });
  } else {
    fallback(next);
  }
}
