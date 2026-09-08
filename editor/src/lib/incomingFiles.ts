// What the relations rail should say, derived once (#684).
//
// The rail used to render one row per reference SITE, so `foundations/src/tokens.md`
// reported "Referenced by (37)" for ten files, with `components/src/categories/overlays.md`
// appearing five times over. It also listed generated targets, and following one
// navigates away from the author's work to a screen that refuses to open the file.
//
// Two rules, one function: group by file, and drop the ones that do not open.
// "Generated" is read from `getPathTier`, never restated as a list of prefixes
// here — a domain that later gains a dist tree is then covered without an edit
// in this file.
import { getPathTier } from "./pathTiers";
import type { IncomingRef } from "./referenceIndex";

export interface IncomingFile {
  path: string;
  /** How many reference sites in this file point here. Always >= 1. */
  sites: number;
  /** The first site's snippet, so the row still shows context. */
  snippet: string;
}

export interface IncomingFiles {
  files: IncomingFile[];
  /** Distinct generated files left out. Rendered, never swallowed: a reader who
   *  knows tokens.md feeds the bundle would otherwise read the shorter list as
   *  the rail having lost them. */
  generatedExcluded: number;
}

/** A target the editor cannot open: CI-derived dist, the Figma-synced token
 *  outputs, the generated root index, the lockstep manifest. `getPathTier`
 *  marks all of them red, and red is exactly "regenerated, do not edit".
 *
 *  Exported because the relations rail is not the only surface that offers a
 *  reference as a destination — `AnchorReferencesPopover` navigates on click
 *  too, and a rule applied to one of them is a rule that recurs in the other. */
export function isGeneratedTarget(path: string): boolean {
  return getPathTier(path).severity === "red";
}

export function incomingFiles(refs: IncomingRef[]): IncomingFiles {
  const byPath = new Map<string, IncomingFile>();
  const excluded = new Set<string>();

  for (const r of refs) {
    if (isGeneratedTarget(r.fromPath)) {
      excluded.add(r.fromPath);
      continue;
    }
    const seen = byPath.get(r.fromPath);
    if (seen) {
      seen.sites += 1;
    } else {
      // Map preserves insertion order, which is what keeps the rail stable
      // between renders rather than resorting under the reader.
      byPath.set(r.fromPath, {
        path: r.fromPath,
        sites: 1,
        snippet: r.snippet,
      });
    }
  }

  return { files: [...byPath.values()], generatedExcluded: excluded.size };
}
