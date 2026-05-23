// CodeMirror 6 wrapper for plain markdown editing.
//
// Renders a single EditorView, exposes ref-style access via the
// `onReady` callback (the Toolbar dispatches transactions directly
// onto this view), and emits `onChange(text)` on every edit.

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";

export interface CodeMirrorEditorProps {
  initialText: string;
  onChange: (text: string) => void;
  onReady?: (view: EditorView) => void;
}

export function CodeMirrorEditor({
  initialText,
  onChange,
  onReady,
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: initialText,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "14px" },
          ".cm-content": {
            fontFamily: "var(--code-font-family, ui-monospace, monospace)",
          },
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    onReady?.(view);
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // initialText is intentionally NOT in deps — we don't recreate the
    // view on every initialText change. Path changes drive remounts via
    // a `key` prop set at the call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} style={{ height: "100%", overflow: "auto" }} />;
}
