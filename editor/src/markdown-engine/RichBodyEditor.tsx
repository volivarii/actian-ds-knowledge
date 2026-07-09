import React from "react";
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx,
} from "@milkdown/core";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { insert } from "@milkdown/utils";
import { MilkdownProvider, Milkdown, useEditor } from "@milkdown/react";
import { Flex, Button } from "@radix-ui/themes";
import type { Octokit } from "@octokit/rest";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { useMilkdownPresets } from "./milkdownPreset";
import { setMediaPreviewSlug } from "./media/mediaNodeView";
import { MediaPickerPopover } from "./MediaPickerPopover";

function MilkdownBody({
  initialText,
  onChange,
  label,
  componentSlug,
  onReady,
}: {
  initialText: string;
  onChange: (md: string) => void;
  label: string;
  componentSlug?: string | null;
  /** Exposes the live editor getter so the parent's <Media> picker can insert
   *  the directive into the running ProseMirror doc. */
  onReady?: (get: () => Editor | undefined) => void;
}) {
  // Prime the module-level preview slug BEFORE the editor mounts. The NodeView
  // factory reads it lazily when each <Media> atom renders, and editor.create()
  // is async (a regular effect kicks it off), so this effect — declared before
  // useEditor — always resolves the slug in time for the first render.
  React.useEffect(() => {
    setMediaPreviewSlug(componentSlug ?? null);
  }, [componentSlug]);

  const { get } = useEditor(
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

  // Publish the getter once it's available. `get` is stable across renders
  // (useEditor memoizes it), so this fires whenever onReady identity changes.
  React.useEffect(() => {
    onReady?.(get);
  }, [get, onReady]);

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
  /** Present only for component-guideline edits — powers the media picker. */
  octokit?: Octokit;
}) {
  const [mode, setMode] = React.useState<"rich" | "source">("rich");
  const [text, setText] = React.useState(initialText);
  const label = `Body editor${filename ? ` — ${filename}` : ""}`;
  // Live editor getter, published by MilkdownBody once created, so the media
  // picker can insert the directive into the running doc.
  const getEditorRef = React.useRef<(() => Editor | undefined) | null>(null);
  const handleReady = React.useCallback(
    (get: () => Editor | undefined) => {
      getEditorRef.current = get;
    },
    [],
  );

  const handleChange = (md: string) => {
    setText(md);
    onChange(md);
  };

  // Interim insertion affordance for rich mode. Task 2 folds media insertion
  // into the full rich-mode toolbar and supersedes this minimal header row.
  const showMediaPicker = mode === "rich" && !!octokit && !!componentSlug;

  return (
    <div>
      <Flex justify="between" align="center" mb="1" gap="2">
        {showMediaPicker && octokit && componentSlug ? (
          <MediaPickerPopover
            octokit={octokit}
            componentSlug={componentSlug}
            onInsert={(snippet) =>
              getEditorRef.current?.()?.action(insert(snippet))
            }
          />
        ) : (
          <span />
        )}
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
            componentSlug={componentSlug}
            onReady={handleReady}
          />
        </MilkdownProvider>
      ) : (
        <CodeMirrorEditor initialText={text} onChange={handleChange} />
      )}
    </div>
  );
}
