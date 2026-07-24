// Resolve what a JSON Schema allows at a block path, and turn that into
// completion candidates. Draft 2020-12, no $ref resolution: an unresolved
// $ref is simply not followed. schemaAtPath returns the $ref object as-is
// (objectBranches finds no `properties` on a bare `{ $ref }`), so
// keyCandidates/valueCandidates conservatively return no candidates rather
// than throwing — this is a CodeMirror completion source, and a throw here
// would break the whole pane, so "no suggestions" is the right degrade, not
// a bug. The six schemas behind frontmatterForms.ts's registry
// (app-context-app, app-context-entity, app-context-pattern,
// category-defaults, content, foundations) contain zero `$ref` and zero
// `$defs` (verified 2026-07-24), so this path is inert on the substrate
// today; see the pinned test below for the behavior if that ever changes.

export type JsonSchema = Record<string, unknown>;

export interface CompletionCandidate {
  label: string;
  detail?: string;
  required: boolean;
}

function asSchema(v: unknown): JsonSchema | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as JsonSchema)
    : null;
}

/** Object branches of a schema: itself if it has `properties`, plus any
 *  `oneOf`/`anyOf` branch that does. An array schema steps into `items`. */
function objectBranches(schema: JsonSchema): JsonSchema[] {
  if (schema.type === "array") {
    const items = asSchema(schema.items);
    return items ? objectBranches(items) : [];
  }
  const out: JsonSchema[] = [];
  if (asSchema(schema.properties)) out.push(schema);
  for (const key of ["oneOf", "anyOf"]) {
    const branches = schema[key];
    if (!Array.isArray(branches)) continue;
    for (const b of branches) {
      const s = asSchema(b);
      if (s) out.push(...objectBranches(s));
    }
  }
  return out;
}

/** Subschema at a block path, or null when the path is not defined. */
export function schemaAtPath(
  schema: JsonSchema,
  path: string[],
): JsonSchema | null {
  let current: JsonSchema | null = schema;
  for (const step of path) {
    if (!current) return null;
    let next: JsonSchema | null = null;
    for (const branch of objectBranches(current)) {
      const props = asSchema(branch.properties);
      const hit = props ? asSchema(props[step]) : null;
      if (hit) {
        next = hit;
        break;
      }
    }
    if (!next) {
      // An open map (additionalProperties: {…}) accepts any key.
      const additional: JsonSchema | null = current
        ? asSchema(current.additionalProperties)
        : null;
      if (!additional) return null;
      next = additional;
    }
    current = next;
  }
  return current;
}

function firstSentence(text: string): string {
  const stop = text.indexOf(". ");
  return stop === -1 ? text : text.slice(0, stop + 1);
}

/** Property names legal at this path, minus the ones already written. */
export function keyCandidates(
  schema: JsonSchema,
  path: string[],
  siblings: string[],
): CompletionCandidate[] {
  const here = schemaAtPath(schema, path);
  if (!here) return [];
  const taken = new Set(siblings);
  const out: CompletionCandidate[] = [];
  const seen = new Set<string>();
  for (const branch of objectBranches(here)) {
    const props = asSchema(branch.properties);
    if (!props) continue;
    const required = new Set(
      Array.isArray(branch.required) ? (branch.required as string[]) : [],
    );
    for (const [name, raw] of Object.entries(props)) {
      if (taken.has(name) || seen.has(name)) continue;
      seen.add(name);
      const sub = asSchema(raw);
      const description =
        sub && typeof sub.description === "string"
          ? sub.description
          : undefined;
      out.push({
        label: name,
        detail: description ? firstSentence(description) : undefined,
        required: required.has(name),
      });
    }
  }
  return out;
}

/** Values the schema pins down for `key` at this path: enum members or a
 *  const. Anything less constrained yields nothing, honestly. */
export function valueCandidates(
  schema: JsonSchema,
  path: string[],
  key: string | null,
): CompletionCandidate[] {
  if (!key) return [];
  const here = schemaAtPath(schema, [...path, key]);
  if (!here) return [];
  const target = here.type === "array" ? asSchema(here.items) : here;
  if (!target) return [];
  if (Array.isArray(target.enum)) {
    return target.enum.map((v) => ({ label: String(v), required: false }));
  }
  if (target.const !== undefined) {
    return [{ label: String(target.const), required: false }];
  }
  return [];
}
