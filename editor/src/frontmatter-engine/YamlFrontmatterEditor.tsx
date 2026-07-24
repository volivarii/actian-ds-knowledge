// CodeMirror 6 pane over a file's frontmatter YAML. The author edits the text
// that gets committed, so there is no projection to keep in sync and no
// re-serialization on save.
//
// Mount/teardown follows markdown-engine/CodeMirrorEditor.tsx: one effect,
// destroy on unmount, and the caller remounts on file change via key={path}.

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { yaml } from "@codemirror/lang-yaml";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { cmDarkSurface } from "../lib/cmDarkSurface";
import { schemaCompletionExtension } from "./schemaCompletion";
import { schemaHoverExtension } from "./schemaHover";
import { frontmatterDiagnostics } from "./schemaDiagnostics";
import type { JsonSchema } from "./schemaWalk";

export interface YamlFrontmatterEditorProps {
  initialText: string;
  schema: JsonSchema;
  onChange: (text: string) => void;
}

export function YamlFrontmatterEditor({
  initialText,
  schema,
  onChange,
}: YamlFrontmatterEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // The mount effect runs once, so its closure would freeze the first
  // onChange. Same latest-ref guard the screen already uses for its body
  // editors.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: initialText,
      extensions: [
        history(),
        // indentWithTab is deliberately NOT in defaultKeymap: CM6 leaves Tab
        // unbound so keyboard users can tab OUT of an editor. YAML indentation
        // is semantic, so the pane binds it and the escape hatch becomes
        // Escape-then-Tab, which CM6 supports out of the box.
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        yaml(),
        schemaCompletionExtension(schema),
        schemaHoverExtension(schema),
        linter((view): Diagnostic[] =>
          frontmatterDiagnostics(view.state.doc.toString(), schema).map(
            (d) => ({
              from: d.from,
              to: d.to,
              severity: d.severity,
              message: d.message,
            }),
          ),
        ),
        lintGutter(),
        cmDarkSurface,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": "Frontmatter YAML" }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
        EditorView.theme({
          "&": { fontSize: "14px" },
          ".cm-content": {
            fontFamily: "var(--zen-font-family-mono), ui-monospace, monospace",
          },
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    return () => view.destroy();
    // initialText/schema are mount-time seeds; the caller remounts with
    // key={path} when the file changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} data-testid="yaml-frontmatter-editor" />;
}
