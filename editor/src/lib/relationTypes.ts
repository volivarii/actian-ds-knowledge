// Single source of the typed-relation visual language.
//
// Every substrate node type gets exactly one color and one human label, so a
// relation reads the same in the graph map, the relations rail, and the inline
// reference chips. Colors are Radix theme vars (the editor renders inside a
// Radix <Theme>), never hardcoded hex, per the token doctrine — the -9 step is
// the solid accent used for dots and swatches.
//
// The keys are the graph's node `type` strings (graph/dist/graph.json):
// component, category, a11y_criterion, foundation_section, content_topic,
// motion_pattern, ux_pattern, app, app_entity, terminology_term. `unknown` is
// the fallback for any future/unmapped type.

export const NODE_TYPE_COLOR: Record<string, string> = {
  component: "var(--indigo-9)",
  ux_pattern: "var(--violet-9)",
  category: "var(--cyan-9)",
  a11y_criterion: "var(--grass-9)",
  foundation_section: "var(--amber-9)",
  content_topic: "var(--crimson-9)",
  motion_pattern: "var(--purple-9)",
  app: "var(--bronze-9)",
  app_entity: "var(--teal-9)",
  terminology_term: "var(--plum-9)",
  unknown: "var(--gray-8)",
};

export const NODE_TYPE_LABEL: Record<string, string> = {
  component: "Component",
  ux_pattern: "Pattern",
  category: "Category",
  a11y_criterion: "Accessibility criterion",
  foundation_section: "Foundation",
  content_topic: "Content topic",
  motion_pattern: "Motion pattern",
  app: "Application",
  app_entity: "Entity",
  terminology_term: "Term",
  unknown: "Node",
};

/** Radix color var for a node type; neutral gray for anything unmapped. */
export function relationTypeColor(type: string): string {
  return NODE_TYPE_COLOR[type] ?? NODE_TYPE_COLOR.unknown!;
}

/** Human singular label for a node type; "Node" for anything unmapped. */
export function relationTypeLabel(type: string): string {
  return NODE_TYPE_LABEL[type] ?? NODE_TYPE_LABEL.unknown!;
}
