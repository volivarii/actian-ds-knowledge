// CM6 adapter: cursor position (yamlCursor) + schema (schemaWalk) -> completions.
// Same shape as markdown-engine/anchorCompletion.ts.

import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { yamlCursorAt } from "./yamlCursor";
import { keyCandidates, valueCandidates, type JsonSchema } from "./schemaWalk";

export function schemaCompletionSource(schema: JsonSchema) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const cursor = yamlCursorAt(ctx.state.doc.toString(), ctx.pos);
    if (!cursor) return null;

    const candidates =
      cursor.kind === "key"
        ? keyCandidates(schema, cursor.path, cursor.siblings)
        : valueCandidates(schema, cursor.path, cursor.key);

    const options: Completion[] = candidates
      .filter((c) => c.label.startsWith(cursor.partial))
      .map((c) => ({
        label: c.label,
        detail: [c.required ? "required" : null, c.detail]
          .filter(Boolean)
          .join(" · "),
        type: cursor.kind === "key" ? "property" : "value",
        // Keys are written as `key: `; values are written bare.
        apply: cursor.kind === "key" ? `${c.label}: ` : c.label,
      }));
    if (options.length === 0) return null;

    return { from: cursor.from, options, validFor: /^[\w-]*$/ };
  };
}

/** CM6 extension factory. Register in the pane's extension array. */
export function schemaCompletionExtension(schema: JsonSchema): Extension {
  return autocompletion({
    override: [schemaCompletionSource(schema)],
    activateOnTyping: true,
  });
}
