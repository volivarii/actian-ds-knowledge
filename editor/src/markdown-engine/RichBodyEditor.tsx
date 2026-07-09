import React from "react";
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx,
} from "@milkdown/core";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { MilkdownProvider, Milkdown, useEditor } from "@milkdown/react";
import { Flex, Button } from "@radix-ui/themes";
import type { Octokit } from "@octokit/rest";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { useMilkdownPresets } from "./milkdownPreset";
import {
  setMediaPreviewSlug,
  setMediaPreviewOctokit,
} from "./media/mediaNodeView";
import { RichToolbar } from "./RichToolbar";

function MilkdownBody({
  initialText,
  onChange,
  label,
  componentSlug,
  octokit,
}: {
  initialText: string;
  onChange: (md: string) => void;
  label: string;
  componentSlug?: string | null;
  /** Present only for component-guideline edits (powers the <Media> preview
   *  fetch); undefined in the headless round-trip, which must fall to the chip. */
  octokit?: Octokit;
}) {
  // Prime the module-level preview slug and octokit before the editor mounts.
  // The NodeView factory reads both lazily when each <Media> atom renders, and
  // editor.create() is async (a regular effect kicks it off), so this effect,
  // declared before useEditor, always resolves them in time for the first render.
  React.useEffect(() => {
    setMediaPreviewSlug(componentSlug ?? null);
    setMediaPreviewOctokit(octokit ?? null);
  }, [componentSlug, octokit]);

  // The editor is registered with the surrounding MilkdownProvider; RichToolbar
  // reaches it via useInstance() to dispatch commands, so no getter is exposed.
  useEditor(
    (root) =>
      // Presets (commonmark + gfm + media NodeView) come from the shared
      // milkdownPreset module so the live editor and the round-trip drift
      // guards never diverge. listener is applied before the presets, as before.
      useMilkdownPresets(
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
          .use(listener),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return <Milkdown />;
}

export function RichBodyEditor({
  initialText,
  onChange,
  filename,
  componentSlug,
  octokit,
}: {
  initialText: string;
  onChange: (md: string) => void;
  filename?: string;
  /** Slug of the component being edited (e.g. `button`); enables <Media>
   *  preview resolution + the insert picker. null/undefined outside components. */
  componentSlug?: string | null;
  /** Present only for component-guideline edits (powers the media picker). */
  octokit?: Octokit;
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
      <Flex justify="end" align="center" mb="1" gap="2">
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
        // RichToolbar sits inside MilkdownProvider so its useInstance() resolves
        // to this editor; it also hosts the <Media> picker (Insert group).
        <MilkdownProvider>
          <RichToolbar octokit={octokit} componentSlug={componentSlug} />
          <MilkdownBody
            initialText={text}
            onChange={handleChange}
            label={label}
            componentSlug={componentSlug}
            octokit={octokit}
          />
        </MilkdownProvider>
      ) : (
        <CodeMirrorEditor initialText={text} onChange={handleChange} />
      )}
    </div>
  );
}
