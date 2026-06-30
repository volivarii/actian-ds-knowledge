// Emits :root CSS custom properties from tokens/tokens.json (DTCG W3C format).
// Token leaves are detected by the `$value` field; intermediate keys become
// path segments. Keys starting with $ or _ are control fields and skipped.
//
// The editor's chrome consumes the resulting var(--zen-…) names. Color tokens
// emit the actian resolved hex from com.actian.themes.actian, falling back to
// $value for non-color tokens (numerics, spacing) that carry no themes extension.
// This makes the emitter alias-tolerant: correct both pre-flip ($value == hex)
// and post-flip ($value == {alias}).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = path.resolve(HERE, "..", "..", "tokens", "tokens.json");
const OUT = path.resolve(HERE, "..", "src", "styles", "tokens.css");

const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8"));

function sanitize(segment) {
  return segment.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
}

// Prefer the already-resolved hex from com.actian.themes.actian; falls back to
// $value for non-color tokens (numerics, spacing) that have no themes extension.
function resolvedHex(leaf) {
  return leaf?.$extensions?.["com.actian.themes"]?.actian ?? leaf.$value;
}

function flatten(obj, prefix = "--zen") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("$") || k.startsWith("_")) continue;
    if (!v || typeof v !== "object") continue;
    const name = `${prefix}-${sanitize(k)}`;
    if ("$value" in v) {
      out.push([name, String(resolvedHex(v))]);
    } else {
      out.push(...flatten(v, name));
    }
  }
  return out;
}

const tuples = flatten(tokens);
const css =
  ":root {\n" +
  tuples.map(([k, v]) => `  ${k}: ${v};`).join("\n") +
  "\n}\n";

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, css);
console.log(`tokens.css written: ${OUT} (${tuples.length} custom properties)`);
