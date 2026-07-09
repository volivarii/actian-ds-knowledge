import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { getMarkdown } from "@milkdown/utils";
import { mediaNodeView } from "./media/mediaNodeView";

/**
 * The canonical Milkdown preset stack for the WYSIWYG body editor: CommonMark
 * plus GFM (tables, strikethrough, task lists, autolinks). Single source of
 * truth so the live editor (RichBodyEditor) and the round-trip drift guards
 * apply IDENTICAL parsing/serialization — they can never diverge.
 */
export function useMilkdownPresets(editor: Editor): Editor {
  // mediaNodeView is a display-only NodeView over the commonmark `html` atom:
  // it renders a preview chip for <Media …/> but never mutates the node, so
  // serialization (and the round-trip drift guards) stay byte-exact.
  return editor.use(commonmark).use(gfm).use(mediaNodeView);
}

/**
 * Headless parse → serialize of a markdown body using the same presets the
 * editor uses. This is the canonical model of what one editor save does to a
 * body; the drift guards build on it. Requires a DOM (happy-dom in tests).
 */
export async function roundTripMarkdown(body: string): Promise<string> {
  const root = globalThis.document.createElement("div");
  const editor = await useMilkdownPresets(
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, body);
    }),
  ).create();
  const out = editor.action(getMarkdown());
  await editor.destroy();
  return out;
}
