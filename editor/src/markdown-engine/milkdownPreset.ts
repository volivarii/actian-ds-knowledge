import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { getMarkdown } from "@milkdown/utils";
import { mediaNodeView } from "./media/mediaNodeView";
import { addAnchorCommand } from "./anchorCommand";

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
  // addAnchorCommand is a dispatchable toolbar command (appends a {#slug} to a
  // heading); registering it here makes its key resolvable in both the live
  // editor and the round-trip guard. It adds no schema, so serialization holds.
  return editor
    .use(commonmark)
    .use(gfm)
    .use(mediaNodeView)
    .use(addAnchorCommand);
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

/**
 * Regex matching disallowed inline HTML in round-tripped markdown. Two forms
 * are allowed (and so excluded by the negative lookahead): `<br>`, which
 * Milkdown serializes as `<br />` (space then slash) for an empty GFM table
 * cell, the shape the rich-mode insert-table / add-row / add-col tools
 * produce; and `<Media>`, the registered display-only directive. The `\s*`
 * is what makes the lookahead recognize that spaced `<br />` form.
 *
 * No `g` flag: every call site here only needs a yes/no answer (does a
 * disallowed tag exist), via `.test()` or `String.prototype.match`. A single
 * shared `g`-flagged RegExp object carries mutable `lastIndex` state, so
 * reusing it across calls (or interleaved test runs) can silently produce
 * wrong answers; dropping `g` keeps every call stateless.
 */
export const DISALLOWED_INLINE_HTML = /<(?!br\b\s*\/?>|Media\b)[A-Za-z]/;

/**
 * Strip fenced code blocks and inline code spans before scanning for inline
 * HTML. Code spans hold literal text (for example `Source: <asset>`), not
 * HTML, so scanning them unstripped would false-positive.
 */
function stripCodeSpans(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
}

/**
 * Thrown by assertGuardSafe when a markdown body fails the guard-safety
 * contract: a non-idempotent round-trip, a Kramdown block IAL, or disallowed
 * inline HTML. This is the discriminator classifiers use to tell "the guard
 * rejected this file" (a normal, expected classification outcome) apart from
 * any other error (a Milkdown crash, a bug elsewhere), which should propagate
 * instead of being silently treated as "unsafe". Surface kept minimal: no
 * extra fields beyond the inherited `message`.
 */
export class GuardViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardViolationError";
  }
}

/**
 * The guard-safety contract shared by the round-trip drift tests (and, next,
 * the safe-paths generator): round-tripping a markdown body twice must be
 * idempotent, the result must contain no Kramdown block IAL, and it must
 * contain no inline HTML except `<br>` and the `<Media>` directive (code
 * spans are ignored, per stripCodeSpans above). Runs the real round trip
 * through the same preset the live editor uses, so this can never diverge
 * from what one editor save actually does to a body.
 *
 * Returns the first round-trip output (rt1) on success, so a caller that
 * needs it afterward (for example, a dist-equivalence check keyed on the
 * round-tripped body) does not have to round-trip again. Throws a
 * GuardViolationError naming which check failed on failure.
 */
export async function assertGuardSafe(markdown: string): Promise<string> {
  const rt1 = await roundTripMarkdown(markdown);
  const rt2 = await roundTripMarkdown(rt1);
  if (rt2 !== rt1) {
    throw new GuardViolationError(
      "round-trip must be idempotent (RT2 === RT1)",
    );
  }
  if (/\{:/.test(rt1)) {
    throw new GuardViolationError(
      "no Kramdown block IAL allowed in round-tripped markdown",
    );
  }
  if (DISALLOWED_INLINE_HTML.test(stripCodeSpans(rt1))) {
    throw new GuardViolationError(
      "no inline HTML allowed except <br> and the <Media> directive",
    );
  }
  return rt1;
}
