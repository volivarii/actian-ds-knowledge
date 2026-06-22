// Regex-only frontmatter split — deliberately does NOT parse YAML. For body-only
// WYSIWYG we ALWAYS separate the raw frontmatter block so it is preserved
// byte-exact and never fed to Milkdown (which would mangle YAML as markdown).
// foundations frontmatter uses unquoted-comma flow-maps the YAML lib mis-parses,
// so the regex-only split is required.
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function splitRawFrontmatter(text: string): {
  frontmatterBlock: string;
  body: string;
} {
  if (!text.startsWith("---")) return { frontmatterBlock: "", body: text };
  const m = text.match(FRONTMATTER_RE);
  if (!m) return { frontmatterBlock: "", body: text };
  return { frontmatterBlock: m[0], body: text.slice(m[0].length) };
}

export function joinRawFrontmatter(frontmatterBlock: string, body: string): string {
  return frontmatterBlock + body;
}
