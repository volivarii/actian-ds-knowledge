// The single rich-safe classifier + corpus walker, shared verbatim by the
// generator (gen-wysiwyg-safe-paths.ts) and the corpus gate
// (tests/markdown-engine/wysiwyg-safe-paths.test.ts). Before this hoist the
// two carried copy-pasted copies of isRichSafe, "kept in lockstep" only by
// the corpus test's committed-equals-fresh assertion, the same copy-paste
// hazard already fixed once for the guard regex. Now there is exactly one
// implementation.
//
// Node-only (fs + createRequire of the CJS registry, happy-dom setup), so
// this lives under editor/scripts/, never editor/src/: editor/src/ is
// Vite-bundled application source, and a node:fs-touching module there would
// be wrong even if currently unreachable from the app entry, and risks
// breaking `npm run build`.
//
// Rich-safe predicate (Milkdown DOM required, so happy-dom must load first):
//   1. assertGuardSafe(body) does not throw: round-trip is idempotent (RT2===RT1),
//      no Kramdown block IAL, no inline HTML except <br> and <Media>.
//   2. When the file's domain declares a per-file distEquivalence, the structured
//      dist view is unchanged across the round-trip (body vs the returned rt1).
import "../tests/setup-happy-dom";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import {
  assertGuardSafe,
  GuardViolationError,
} from "../src/markdown-engine/milkdownPreset";
import { splitRawFrontmatter } from "../src/markdown-engine/rawFrontmatter";

const require = createRequire(import.meta.url);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Repo root, resolved from this file's location. */
export const REPO = path.resolve(SCRIPT_DIR, "..", "..");

const domains = require("../../domains.json");
const {
  deriveEquivalenceView,
  distEquivalenceForPath,
  editableSourceFiles: walkEditableSourceFiles,
} = require("../../scripts/lib/wysiwyg-registry.js") as {
  deriveEquivalenceView: (d: unknown, rel: string, body: string) => unknown;
  distEquivalenceForPath: (d: unknown, rel: string) => unknown | null;
  editableSourceFiles: (repoRoot: string) => string[];
};

/**
 * The walked universe: every editable source file, repo-relative,
 * forward-slash. No existsSync skip: a renamed or deleted file simply cannot
 * appear, rather than being silently passed over while still nominally "in"
 * a curated list (the old allowlist's shape).
 */
export function editableSourceFiles(): string[] {
  return walkEditableSourceFiles(REPO);
}

export interface RichSafeResult {
  safe: boolean;
  /** Present when safe is false: which check rejected the file, human-readable. */
  reason?: string;
}

/**
 * Classify a single file as rich-safe or not.
 *
 * A GuardViolationError from assertGuardSafe (the guard rejected the body)
 * and a dist-equivalence mismatch (the round-trip changed the derived dist
 * view) both mean "unsafe, classify as such" and are reported via `reason`.
 * Any OTHER error (a Milkdown crash, a deriveEquivalenceView bug, a
 * file-read error) is NOT a classification outcome: it re-throws so it
 * surfaces loudly instead of silently downgrading the file to unsafe. A
 * bare catch-all here would only ever be able to make a file MORE
 * conservative (never mangle one), but it would mask real bugs and discard
 * the guard's message naming which check failed.
 */
export async function isRichSafe(rel: string): Promise<RichSafeResult> {
  const { body } = splitRawFrontmatter(
    readFileSync(path.join(REPO, rel), "utf8"),
  );
  let rt1: string;
  try {
    rt1 = await assertGuardSafe(body);
  } catch (err) {
    if (err instanceof GuardViolationError) {
      return { safe: false, reason: err.message };
    }
    throw err;
  }
  if (distEquivalenceForPath(domains, rel)) {
    // Compare values directly (isDeepStrictEqual) rather than catching an
    // assert.deepEqual throw: a comparison that returns a boolean cannot be
    // confused with an unrelated thrown error the way a try/catch can.
    const equivalent = isDeepStrictEqual(
      deriveEquivalenceView(domains, rel, rt1),
      deriveEquivalenceView(domains, rel, body),
    );
    if (!equivalent) {
      return {
        safe: false,
        reason: "dist-equivalence view changed by round-trip",
      };
    }
  }
  return { safe: true };
}

/**
 * Walk every editable file and classify each one, returning the sorted list
 * of rich-safe relative paths. This is the shared walk-and-classify loop
 * used by both the generator and the corpus gate.
 */
export async function classifyAll(): Promise<string[]> {
  const paths: string[] = [];
  for (const rel of editableSourceFiles()) {
    const { safe } = await isRichSafe(rel);
    if (safe) paths.push(rel);
  }
  paths.sort();
  return paths;
}
