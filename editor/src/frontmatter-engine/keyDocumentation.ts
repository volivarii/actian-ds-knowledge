// Resolve the schema documentation for whatever YAML key sits under a text
// position: its name, its type, whether it's required, its `description`,
// and its `examples`. Pure string + schema analysis, no CodeMirror or React
// import, so it's testable without a view — matching schemaDiagnostics.ts's
// shape. schemaHover.ts wraps this in a CM6 `hoverTooltip`; that wiring is a
// thin adapter over the function below.

import { yamlKeyAt } from "./yamlCursor";
import { schemaAtPath, keyCandidates, type JsonSchema } from "./schemaWalk";

export interface KeyDocumentation {
  key: string;
  /** Human-readable type label ("string", "array of object", …), or null
   *  when the schema doesn't pin one down (e.g. a bare `const`). */
  type: string | null;
  required: boolean;
  description: string | null;
  examples: unknown[] | null;
  /** Range of the KEY NAME text in the source — the tooltip's anchor. */
  from: number;
  to: number;
}

function asSchema(v: unknown): JsonSchema | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as JsonSchema)
    : null;
}

/** A readable type label for a resolved subschema. Draft 2020-12 allows
 *  `type` as a string or an array of strings (a union); an array schema
 *  nests one level so "array of string" reads better than a bare "array". */
function describeType(sub: JsonSchema): string | null {
  const t = sub.type;
  const base = Array.isArray(t)
    ? t.join(" | ")
    : typeof t === "string"
      ? t
      : null;
  if (base !== "array") return base;
  const items = asSchema(sub.items);
  const itemType = items ? describeType(items) : null;
  return itemType ? `array of ${itemType}` : "array";
}

/** Documentation for the key whose name text contains `offset`, or null when
 *  the position isn't over a key name, or the schema has nothing to say
 *  about it (an unknown key under `additionalProperties: false`, a path that
 *  doesn't resolve). The same honest "no answer" degrade schemaWalk.ts's own
 *  candidate functions use, rather than guessing. */
export function keyDocumentationAt(
  text: string,
  offset: number,
  schema: JsonSchema,
): KeyDocumentation | null {
  const at = yamlKeyAt(text, offset);
  if (!at) return null;

  const sub = schemaAtPath(schema, [...at.path, at.key]);
  if (!sub) return null;

  // keyCandidates already computes the required set for a path's siblings;
  // reuse it with an empty exclusion list (nothing "already written") rather
  // than re-deriving `required` from the parent schema's branches here.
  const required =
    keyCandidates(schema, at.path, []).find((c) => c.label === at.key)
      ?.required ?? false;

  return {
    key: at.key,
    type: describeType(sub),
    required,
    description: typeof sub.description === "string" ? sub.description : null,
    examples: Array.isArray(sub.examples) ? sub.examples : null,
    from: at.from,
    to: at.to,
  };
}
