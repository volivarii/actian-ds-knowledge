// Anchor index — read-only scanner + session cache over the substrate's
// {#kebab-slug} reference contracts. See spec
// 2026-05-24-anchor-autocomplete-design.md for the rationale + lifecycle.

const HEADING_ANCHOR_RE = /^#{1,6}\s+.+?\s+\{#([a-z][a-z0-9-]*)\}\s*$/gm;
const BOLD_PARA_ANCHOR_RE = /^\*\*[^*]+\*\*\s+\{#([a-z][a-z0-9-]*)\}\s*$/gm;
const YAML_REF_RE = /\{\s*ref\s*:\s*([a-z][a-z0-9-]*)/g;
const LINK_ANCHOR_RE = /\[[^\]]+\]\((?!https?:\/\/)[^)]*#([a-z][a-z0-9-]*)\)/g;
const FENCED_CODE_RE = /(?:```|~~~)[\s\S]*?(?:```|~~~)/g;

export interface AnchorEntry {
  slug: string;
  definedIn: string[];
  referencedBy: string[];
}

export interface AnchorIndex {
  entries: Map<string, AnchorEntry>;
  scannedAt: number;
  scannedPaths: string[];
}

/** Pure scanner — no I/O. Strips fenced code first to avoid false positives. */
export function scanFileForAnchors(text: string): {
  defines: string[];
  references: string[];
} {
  const stripped = text.replace(FENCED_CODE_RE, (m) =>
    "\n".repeat(m.split("\n").length - 1),
  );
  const defines: string[] = [];
  const references: string[] = [];

  for (const re of [HEADING_ANCHOR_RE, BOLD_PARA_ANCHOR_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(stripped)) !== null) defines.push(m[1]!);
  }
  for (const re of [YAML_REF_RE, LINK_ANCHOR_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(stripped)) !== null) references.push(m[1]!);
  }
  return { defines, references };
}
