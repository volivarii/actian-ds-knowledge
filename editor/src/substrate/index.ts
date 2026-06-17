// Public API for the substrate module. UI components import ONLY from here.
//
// Adding to this barrel is the doctrine-cued moment to ask: should this
// be substrate-internal, or is it genuinely needed at the UI layer?

export { loadTaxonomy, TaxonomyLoadError } from "./taxonomy";
export type { Taxonomy, Domain, SearchResult, LoadOpts } from "./taxonomy";
export { buildTaxonomyFromAssets } from "./buildTaxonomyFromAssets";
export { buildRefGraph, parseFrontmatter } from "./refGraph";
export { parseLocalFrontmatter } from "./parseLocalFrontmatter";
export type {
  RefGraph,
  Consumer,
  OutgoingConnection,
  BrokenRef,
  RefType,
  AnyRefField,
} from "./refGraph";
// NOTE: refStore VALUE helpers (FrontmatterRefStore, refFieldFor,
// isFlatField, isFlatRefDomain) are intentionally NOT re-exported here.
// The barrel re-exports Node-only modules (loadTaxonomy → node:fs); browser
// code must value-import from the concrete module path (../substrate/refStore)
// to keep those out of the bundle. Type re-exports above are erased, so safe.
export { suggestRefs } from "./ai";
export type { RefSuggestion, SuggestResult, SuggestOpts } from "./ai";
export {
  addRefToFrontmatter,
  refTypeFor,
  removeRefFromFrontmatter,
} from "./frontmatterRewriter";
export type { RefPick } from "./frontmatterRewriter";
