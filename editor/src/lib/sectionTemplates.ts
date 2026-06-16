// Editorial section scaffolds for the prose component-guideline domains.
//
// These are PRESENTATION/authoring guidance, not a parsed contract: the docs
// renderer passes content/usage/behavior headings through verbatim (only the
// DESIGN domain's headings are a parsed contract — those live in the substrate
// at components/dist/canonical-sections.json). So per doctrine P3 (presentation
// hints belong to the consumer) these live editor-side. Drift here is cosmetic,
// not breaking.
//
// Sources: content sections = content/src/AUTHORING.md §"Section structure";
// usage/behavior = sensible editorial defaults (the substrate has no canonical
// list for these domains).

export const SECTION_TEMPLATES: Record<"content" | "usage" | "behavior", string[]> = {
  content: ["When to use", "Style", "Behavior", "Do / Don't"],
  usage: ["When to use", "When not to use", "Choosing a variant"],
  behavior: ["States", "Keyboard interaction", "Motion"],
};
