// Substrate AI surface — v1/v2 stub. v3 will call Anthropic with the
// section body + condensed taxonomy snippets and return suggested refs.
// No UI calls it yet: the interface stays stable so a future surface can
// adopt it as a drop-in once the org clears API procurement.

import type { Domain } from "./taxonomy";

export interface RefSuggestion {
  slug: string;
  domain: Domain;
  confidence: number; // 0..1
  rationale: string;
}

export interface SuggestResult {
  status: "ok" | "deferred" | "error";
  suggestions: RefSuggestion[];
  message: string;
}

export interface SuggestOpts {
  domains: Domain[];
}

const DEFERRED_MESSAGE =
  "AI suggestions are deferred until the Anthropic API budget clears procurement. Until then, search manually above.";

export async function suggestRefs(_body: string, _opts: SuggestOpts): Promise<SuggestResult> {
  return {
    status: "deferred",
    suggestions: [],
    message: DEFERRED_MESSAGE,
  };
}
