// Thin wrappers around the `yaml` package. The contract is *semantic*
// round-trip — parse → stringify → parse yields the same JS shape.
//
// `stringifyYaml` accepts an optional `originalText` so the leading header
// of the source file (blank lines + `#` comments above the first data line)
// is preserved across an editor round-trip. This is load-bearing for files
// like `components/src/<slug>/_meta.yml` that start with a
// `# yaml-language-server: $schema=…` directive — stripping it would break
// every author's IDE schema-hinting on the next checkout.
//
// In-body / trailing comments are NOT preserved in Phase 1a. The `yaml`
// package's CST API supports it via parseDocument/Document.toString, but the
// document-mutate-via-JSON path is non-trivial and lands in PR 2 if authors
// hit a case where it bites.

import { parse, stringify } from "yaml";

export function parseYaml<T = unknown>(text: string): T {
  return parse(text) as T;
}

export function stringifyYaml(
  value: unknown,
  originalText?: string,
): string {
  const body = stringify(value, { lineWidth: 0 });
  if (!originalText) return body;
  const header = extractLeadingHeader(originalText);
  return header ? header + body : body;
}

function extractLeadingHeader(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      out.push(line);
    } else {
      break;
    }
  }
  if (out.length === 0) return "";
  return out.join("\n") + "\n";
}
