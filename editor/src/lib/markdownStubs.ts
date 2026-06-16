// Initial content for new (404) markdown files.
//
// The author landed here for a path that doesn't exist on remote yet. The stub
// gives them a real section frame (not a blank canvas). Design sections + stable
// anchors come from the substrate canon (canonical-sections.json); content/usage/
// behavior sections come from the editorial sectionTemplates constant. Anchors are
// scaffolded ONLY for design (the governed contract) — never derived from free
// heading text for the editorial domains (P6/F1 safety).

import canonicalSectionsRaw from "../../../components/dist/canonical-sections.json";
import { SECTION_TEMPLATES } from "./sectionTemplates";

const COMPONENT_DOMAIN_RE =
  /^components\/src\/([^/]+)\/(content|usage|design|behavior|tokens)\.md$/;
const CATEGORY_RE = /^components\/src\/categories\/([^/]+)\.md$/;

const DOMAIN_LABEL: Record<string, string> = {
  content: "Content",
  usage: "Usage",
  design: "Design",
  behavior: "Behavior",
  tokens: "Tokens",
};

interface CanonicalSection {
  key: string;
  heading: string;
  anchor: string;
  aliases: string[];
  mediaRole: string;
}
const DESIGN_SECTIONS = (canonicalSectionsRaw as { design: CanonicalSection[] }).design;

function humanize(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

// Design: governed headings + stable {#anchor} from the substrate canon, with a
// per-section nudge toward the matching media role (insertable from the toolbar).
function designSectionBlocks(comp: string): string[] {
  return DESIGN_SECTIONS.flatMap((s) => [
    `## ${s.heading} {#${s.anchor}}`,
    "",
    `<!-- ${s.heading} guidance for ${comp}. Insert the "${s.mediaRole}" media from the toolbar. -->`,
    "",
  ]);
}

// Editorial domains: headings only, NO anchors (not a parsed contract).
function editorialSectionBlocks(comp: string, domain: "content" | "usage" | "behavior"): string[] {
  return SECTION_TEMPLATES[domain].flatMap((heading) => [
    `## ${heading}`,
    "",
    `<!-- ${heading} guidance for ${comp}. -->`,
    "",
  ]);
}

export function buildMarkdownStub(path: string, opts?: { title?: string }): string {
  const compDomain = COMPONENT_DOMAIN_RE.exec(path);
  if (compDomain) {
    const slug = compDomain[1]!;
    const domain = compDomain[2]!;
    const comp = humanize(slug);
    const label = DOMAIN_LABEL[domain] ?? humanize(domain);
    const head = [`# ${comp} — ${label}`, ""];

    if (domain === "design") {
      return [...head, ...designSectionBlocks(comp)].join("\n");
    }
    if (domain === "content" || domain === "usage" || domain === "behavior") {
      return [...head, ...editorialSectionBlocks(comp, domain)].join("\n");
    }
    // tokens (and any other) → minimal stub (tokens are authored as tokens.yml).
    return [
      ...head,
      `<!-- Draft authoring stub. Replace this with the ${label.toLowerCase()} guidance for ${comp}. -->`,
      "",
    ].join("\n");
  }

  const category = CATEGORY_RE.exec(path);
  if (category) {
    const slug = category[1]!;
    return [
      `# ${humanize(slug)} — category defaults`,
      "",
      `<!-- Draft authoring stub. Cross-component defaults for the ${humanize(slug)} category. -->`,
      "",
    ].join("\n");
  }

  // Generic fallback — use opts.title if provided, otherwise derive from basename.
  const base = path.split("/").pop()!.replace(/\.md$/, "");
  const heading = opts?.title?.trim() || humanize(base);
  return [
    `# ${heading}`,
    "",
    "<!-- Draft authoring stub. Replace with the file's content. -->",
    "",
  ].join("\n");
}
