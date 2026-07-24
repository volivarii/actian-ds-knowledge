// Re-join a frontmatter YAML block and a prose body into file bytes.
//
// The YAML is the author's own text, never a re-serialization of a parsed
// object: it is emitted between the fences verbatim, with no re-serialization
// pass, no comment loss, and no key reordering. That is the property the
// form-based path had to work for (flowAtDepth, preserveComments, the
// comment-preserving Document merge) and repeatedly lost.
//
// Two normalizations still apply, and both touch only the fences, never the
// YAML text itself:
//   - fences are always emitted as `---\n`, so a CRLF-fenced source comes
//     back with LF fences;
//   - the closing fence always ends in a newline, so a source whose closing
//     fence has no trailing newline gains one.
// Both shapes are accepted by splitFrontmatter's FRONTMATTER_RE, but as of
// 2026-07-24 neither occurs anywhere in the substrate this design covers
// (verified across all 96 fenced files in app-context, content, foundations,
// and the component categories) — so this is documented behavior, not known
// breakage.
//
// Fence shape mirrors splitFrontmatter's FRONTMATTER_RE exactly:
// `---\n<yaml>\n---\n<body>`.

/** Join a YAML frontmatter block and a body into a complete file. */
export function assembleYamlFrontmatterFile(
  yamlText: string,
  body: string,
): string {
  return `---\n${yamlText}\n---\n${body}`;
}
