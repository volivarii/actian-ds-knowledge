// Links in guidance text are the one kind of connection the graph does not
// hold, so the section reads them from the current text.

const FENCE = /^```[\s\S]*?^```/gm;
const LINK = /\]\(([a-z0-9][a-z0-9-]*)\)/g;
const CODE = /`([a-z0-9][a-z0-9-]*)`/g;

function withoutFences(md: string): string {
  return md.replace(FENCE, "");
}

/** Bare-slug link targets (`[text](slug)`), unique, in first-seen order. */
export function linkedSlugs(markdown: string): string[] {
  const out: string[] = [];
  for (const m of withoutFences(markdown).matchAll(LINK)) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

/** Code-style spans (`` `slug` ``) whose slug is in `known`, unique. */
export function codeMentions(markdown: string, known: Set<string>): string[] {
  const out: string[] = [];
  for (const m of withoutFences(markdown).matchAll(CODE))
    if (known.has(m[1]!) && !out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

/** Replace the first `` `slug` `` span with a standard link `[text](slug)`. */
export function linkMention(markdown: string, slug: string, text: string): string {
  const span = "`" + slug + "`";
  const i = markdown.indexOf(span);
  if (i < 0) return markdown;
  return markdown.slice(0, i) + `[${text}](${slug})` + markdown.slice(i + span.length);
}
