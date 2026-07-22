import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renameAnchorInText,
  crossFileReferrers,
} from "../../src/markdown-engine/anchorRename";
import { setCachedIndexForTesting } from "../../src/lib/anchorIndex";

test("renames the heading marker", () => {
  assert.equal(
    renameAnchorInText("## Overview {#overview}\n", "overview", "intro"),
    "## Overview {#intro}\n",
  );
});

test("rewrites same-file links but not cross-file links", () => {
  const input =
    "## A {#a}\n\nsee [x](#a) and [y](modal#a) and [z](../f.md#a)\n";
  const out = renameAnchorInText(input, "a", "b");
  assert.match(out, /## A \{#b\}/);
  assert.match(out, /\[x\]\(#b\)/); // same-file rewritten
  assert.match(out, /\[y\]\(modal#a\)/); // cross-file untouched
  assert.match(out, /\[z\]\(\.\.\/f\.md#a\)/); // cross-file untouched
});

test("leaves markers and links inside fenced code untouched", () => {
  const input =
    "## A {#a}\n\n```\n## Example {#a}\nsee [x](#a)\n```\n[real](#a)\n";
  const out = renameAnchorInText(input, "a", "b");
  assert.match(out, /## A \{#b\}/); // real heading renamed
  assert.match(out, /```\n## Example \{#a\}\nsee \[x\]\(#a\)\n```/); // fence untouched
  assert.match(out, /\[real\]\(#b\)/); // real link renamed
});

test("byte-stable when nothing matches", () => {
  const input = "## Other {#other}\n\nprose\n";
  assert.equal(renameAnchorInText(input, "a", "b"), input);
});

test("crossFileReferrers: source referrers minus self and dist", async () => {
  setCachedIndexForTesting({
    entries: new Map([
      [
        "a",
        {
          slug: "a",
          definedIn: ["components/src/button/usage.md"],
          referencedBy: [
            "components/src/button/usage.md", // self
            "components/src/modal/usage.md", // cross-file source
            "components/dist/guidelines/button.json", // derived, excluded
          ],
        },
      ],
    ]),
    scannedAt: 1,
    scannedPaths: [],
    texts: new Map(),
  });
  const gh = {} as any;
  const out = await crossFileReferrers(
    gh,
    "a",
    "components/src/button/usage.md",
  );
  assert.deepEqual(out, ["components/src/modal/usage.md"]);
  setCachedIndexForTesting(null);
});
