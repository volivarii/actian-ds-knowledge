// Re-join a frontmatter YAML block and a prose body into file bytes.
//
// The YAML is the author's own text, never a re-serialization of a parsed
// object, so a record whose frontmatter was not edited round-trips
// byte-identically by construction. That is the property the form-based path
// had to work for (flowAtDepth, preserveComments, the comment-preserving
// Document merge) and repeatedly lost.
//
// Fence shape mirrors splitFrontmatter's FRONTMATTER_RE exactly:
// `---\n<yaml>\n---\n<body>`.

/** Join a YAML frontmatter block and a body into a complete file. */
export function assembleYamlFrontmatterFile(
  yamlText: string,
  body: string,
): string {
  // Trailing newlines would otherwise stack up as blank lines before the
  // closing fence on every save.
  const trimmed = yamlText.replace(/\n+$/, "");
  return `---\n${trimmed}\n---\n${body}`;
}
