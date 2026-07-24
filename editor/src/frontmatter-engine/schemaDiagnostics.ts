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
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);

const validators = new WeakMap<JsonSchema, ReturnType<typeof ajv.compile>>();
function validatorFor(schema: JsonSchema) {
  let v = validators.get(schema);
  if (!v) {
    v = ajv.compile(schema);
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

  const data = doc.toJS();
  const validate = validatorFor(schema);
  if (validate(data)) return [];

  // A diagnostic with no locatable node (a root-level required-property
  // error names an object that IS present, just short a field, so there is
  // no node "for the missing thing" to point at) lands on the first line: a
  // "somewhere in this record" cue, honestly short of claiming a precision
  // the data doesn't give us.
  const firstLineEnd = text.indexOf("\n") + 1 || text.length;
  const fallback = { from: 0, to: Math.min(firstLineEnd, text.length) };

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
