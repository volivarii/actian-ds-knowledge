import React from "react";
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx,
} from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { MilkdownProvider, Milkdown, useEditor } from "@milkdown/react";
import { Flex, Button } from "@radix-ui/themes";
import { CodeMirrorEditor } from "./CodeMirrorEditor";

function MilkdownBody({
  initialText,
  onChange,
  label,
}: {
  initialText: string;
  onChange: (md: string) => void;
  label: string;
}) {
  useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, initialText);
          // Set accessible attributes on the ProseMirror contenteditable.
          // editorViewOptionsCtx.attributes → passed to ProseMirror EditorView
          // which applies them to view.dom (the contenteditable element).
          // Signature: { [name: string]: string }
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            attributes: {
              ...(typeof prev.attributes === "object" &&
              prev.attributes !== null &&
              !Array.isArray(prev.attributes)
                ? (prev.attributes as Record<string, string>)
                : {}),
              role: "textbox",
              "aria-multiline": "true",
              "aria-label": label,
            },
          }));
          // markdownUpdated callback receives (ctx, markdown, prevMarkdown)
          ctx
            .get(listenerCtx)
            .markdownUpdated((_ctx, markdown) => onChange(markdown));
        })
        .use(listener)
        .use(commonmark),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return <Milkdown />;
}

export function RichBodyEditor({
  initialText,
  onChange,
  filename,
}: {
  initialText: string;
  onChange: (md: string) => void;
  filename?: string;
}) {
  const [mode, setMode] = React.useState<"rich" | "source">("rich");
  const [text, setText] = React.useState(initialText);
  const label = `Body editor${filename ? ` — ${filename}` : ""}`;

  const handleChange = (md: string) => {
    setText(md);
    onChange(md);
  };

  return (
    <div>
      <Flex justify="end" mb="1">
        {/* Action-model toggle: the accessible name states the action this
            button performs (not a pressed state). A flipping label + aria-pressed
            would announce contradictory state, and aria-label also keeps the
            "</>" glyphs from being read out literally. */}
        <Button
          size="1"
          variant="soft"
          aria-label={
            mode === "rich"
              ? "Edit markdown source"
              : "Switch to rich text editor"
          }
          onClick={() => setMode((m) => (m === "rich" ? "source" : "rich"))}
        >
          {mode === "rich" ? "</> Source" : "Rich text"}
        </Button>
      </Flex>
      {mode === "rich" ? (
        <MilkdownProvider>
          <MilkdownBody
            initialText={text}
            onChange={handleChange}
            label={label}
          />
        </MilkdownProvider>
      ) : (
        <CodeMirrorEditor initialText={text} onChange={handleChange} />
      )}
    </div>
  );
}
