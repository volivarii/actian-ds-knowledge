// Validate a frontmatter YAML block against its JSON Schema and place each
// error on the text that caused it. No CodeMirror types here: the pane wraps
// this in a linter(), and keeping it pure makes it testable without a view.

import { parseDocument, isNode, isMap, isScalar } from "yaml";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { JsonSchema } from "./schemaWalk";

export interface FrontmatterDiagnostic {
  from: number;
  to: number;
  severity: "error";
  message: string;
}

// strict:false matches the RJSF validator the form used, so a schema that
// validated before still validates now. allErrors surfaces every problem in
// one pass instead of one per keystroke.
//
// addUsedSchema:false is load-bearing, not decorative: FrontmatterBodyEditScreen
// re-parses the schema file with JSON.parse() on every load effect run, so the
// second time a record with the same $id (e.g. the second app-context record
// opened in a session) is edited, compile() below receives a NEW object that
// happens to share that $id. Ajv's default addUsedSchema:true writes every
// compiled schema into a process-global registry keyed by $id and throws
// "schema with key or id ... already exists" on the second insert. Setting it
// false keeps compile() purely local so re-parsed duplicates don't collide.
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  addUsedSchema: false,
});
addFormats(ajv);

// A schema Ajv can't compile (bad $ref, malformed keyword, ...) is a real
// possibility here: schemas come from a file the author can hand-edit. We
// cache the failure alongside successes so a broken schema doesn't re-throw
// (and re-log) on every keystroke's linter() call.
type CompileResult =
  | { ok: true; validate: ReturnType<typeof ajv.compile> }
  | { ok: false; message: string };

const validators = new WeakMap<JsonSchema, CompileResult>();
function validatorFor(schema: JsonSchema): CompileResult {
  let v = validators.get(schema);
  if (!v) {
    try {
      v = { ok: true, validate: ajv.compile(schema) };
    } catch (err) {
      v = {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
    validators.set(schema, v);
  }
  return v;
}

/** Ajv instancePath ("/properties/2/type") to yaml path parts. */
function pathParts(instancePath: string): (string | number)[] {
  if (!instancePath) return [];
  return instancePath
    .slice(1)
    .split("/")
    .map((raw) => {
      const part = raw.replace(/~1/g, "/").replace(/~0/g, "~");
      return /^\d+$/.test(part) ? Number(part) : part;
    });
}

export function frontmatterDiagnostics(
  text: string,
  schema: JsonSchema,
): FrontmatterDiagnostic[] {
  const doc = parseDocument(text);

  if (doc.errors.length > 0) {
    return doc.errors.map((err) => ({
      from: Math.min(err.pos[0], text.length),
      to: Math.min(Math.max(err.pos[1], err.pos[0]), text.length),
      severity: "error" as const,
      message: err.message,
    }));
  }

  // A diagnostic with no locatable node (a root-level required-property
  // error names an object that IS present, just short a field, so there is
  // no node "for the missing thing" to point at) lands on the first line: a
  // "somewhere in this record" cue, honestly short of claiming a precision
  // the data doesn't give us. The same fallback also carries a compile
  // failure below, since a broken schema has no node to blame either.
  const firstLineEnd = text.indexOf("\n") + 1 || text.length;
  const fallback = { from: 0, to: Math.min(firstLineEnd, text.length) };

  const compiled = validatorFor(schema);
  if (!compiled.ok) {
    // Surface this instead of throwing: an uncompilable schema must be
    // visible to the author (Task 6 wraps this in a linter() callback that
    // can't handle an exception), not silently swallowed into no diagnostics.
    return [
      {
        from: fallback.from,
        to: fallback.to,
        severity: "error" as const,
        message: `schema error: ${compiled.message}`,
      },
    ];
  }
  const validate = compiled.validate;

  const data = doc.toJS();
  if (validate(data)) return [];

  return (validate.errors ?? []).map((err) => {
    const parts = pathParts(err.instancePath);
    const params = err.params as {
      additionalProperty?: string;
      missingProperty?: string;
    };
    const extra = params.additionalProperty;

    let range = fallback;
    if (extra) {
      // additionalProperties names the offending KEY in params, but that key
      // has no path of its own in the parsed data (only its value does):
      // doc.getIn([...parts, extra]) resolves to the VALUE node, not the
      // key. Find the key node directly on the parent mapping instead.
      const parent = parts.length > 0 ? doc.getIn(parts, true) : doc.contents;
      const pair = isMap(parent)
        ? parent.items.find((p) => isScalar(p.key) && p.key.value === extra)
        : undefined;
      if (pair && isScalar(pair.key) && pair.key.range) {
        range = { from: pair.key.range[0], to: pair.key.range[1] };
      } else {
        // Structural lookup failed for some reason: fall back to a literal
        // text search for the key rather than losing the position entirely.
        const at = text.indexOf(`${extra}:`);
        if (at !== -1) range = { from: at, to: at + extra.length };
      }
    } else if (parts.length > 0) {
      const node = doc.getIn(parts, true);
      if (isNode(node) && node.range) {
        range = { from: node.range[0], to: node.range[1] };
      }
    }

    const name = extra ?? params.missingProperty ?? parts.join(".");
    const message = name
      ? `${name}: ${err.message}`
      : (err.message ?? "invalid");

    return {
      from: Math.min(range.from, text.length),
      to: Math.min(Math.max(range.to, range.from), text.length),
      severity: "error" as const,
      message,
    };
  });
}
