export interface MergeResult {
  clean: boolean;
  text: string;
}

/**
 * File-granularity 3-way merge. Clean when at most one side changed (or both
 * made the same change); otherwise emits a single conflict block for the
 * author to resolve. (Line-level diff3 is a future enhancement.)
 */
export function threeWayMerge(base: string, mine: string, theirs: string): MergeResult {
  if (mine === theirs) return { clean: true, text: mine };
  if (mine === base) return { clean: true, text: theirs };
  if (theirs === base) return { clean: true, text: mine };
  return {
    clean: false,
    text: `<<<<<<< yours\n${mine}\n=======\n${theirs}\n>>>>>>> main`,
  };
}
