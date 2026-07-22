import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renameAnchorInText,
  crossFileReferrers,
  countSameFileLinks,
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

test("a longer outer fence wrapping a shorter inner example is untouched", () => {
  // ```` (4 backticks) wraps a ``` example that itself contains {#a}; the inner
  // ``` must NOT close the outer fence, so nothing inside is rewritten.
  const input =
    "## H {#a}\n\n````markdown\n## Inner {#a}\nsee [x](#a)\n```\n````\n\n[real](#a)\n";
  const out = renameAnchorInText(input, "a", "b");
  assert.match(out, /## H \{#b\}/); // real heading renamed
  assert.match(out, /\[real\]\(#b\)/); // real link renamed
  assert.match(out, /## Inner \{#a\}/); // inside outer fence untouched
  assert.match(out, /see \[x\]\(#a\)/); // inside outer fence untouched
});

test("an unterminated fence protects everything after it", () => {
  const input = "## H {#a}\n\n```\n## Example {#a}\nsee [x](#a)\n";
  const out = renameAnchorInText(input, "a", "b");
  assert.match(out, /## H \{#b\}/); // before the fence: renamed
  assert.match(out, /## Example \{#a\}/); // after unclosed fence: untouched
  assert.match(out, /see \[x\]\(#a\)/); // after unclosed fence: untouched
});

test("markers and links inside inline code are untouched", () => {
  const input =
    "## A {#a}\n\nUse `{#a}` and `[x](#a)` inline, but rename [real](#a).\n";
  const out = renameAnchorInText(input, "a", "b");
  assert.match(out, /## A \{#b\}/); // heading renamed
  assert.match(out, /`\{#a\}`/); // inline code marker untouched
  assert.match(out, /`\[x\]\(#a\)`/); // inline code link untouched
  assert.match(out, /rename \[real\]\(#b\)/); // real prose link renamed
});

test("a $-bearing new slug is inserted literally (no replacement-pattern interpretation)", () => {
  assert.equal(
    renameAnchorInText("## A {#a}\n\n[x](#a)\n", "a", "x$&y"),
    "## A {#x$&y}\n\n[x](#x$&y)\n",
  );
});

test("countSameFileLinks: counts only live same-file links (fence + inline safe)", () => {
  const input =
    "## A {#a}\n\n[one](#a) and [two](#a).\n\n`[code](#a)` inline.\n\n```\n[fenced](#a)\n```\n\n[three](#a) and [cross](other#a).\n";
  // one, two, three -> 3; the inline-code, fenced, and cross-file ones excluded.
  assert.equal(countSameFileLinks(input, "a"), 3);
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
