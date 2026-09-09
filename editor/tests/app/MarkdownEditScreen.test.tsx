import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import {
  MarkdownEditScreen,
  firstH2Anchor,
} from "../../src/app/MarkdownEditScreen";
import { submissionCartSingleton } from "../../src/drafts/store-instance";
import { countsBySection } from "../../src/lib/referenceIndex";
import { setCachedIndexForTesting } from "../../src/lib/anchorIndex";
import { setWysiwygFlag } from "../helpers/editorSurface";
import {
  getAnnouncement,
  announce as announceForTest,
} from "../../src/lib/announcer";

/** The announcer is a module-level store, so a prior test's message survives
 *  into this one. Reset by announcing a sentinel nobody asserts on. */
function resetAnnouncementsForTest() {
  announceForTest("");
}

// File-level, not inline per test: an inline cleanup() after the last
// assertion is skipped the moment that assertion throws, leaking a mounted
// component into the next test. afterEach runs regardless of the test's
// outcome, so a throw can no longer leak a mount.
afterEach(() => {
  cleanup();
});

function makeFakeOctokit(remoteText: string, remoteSha = "SHA_REMOTE_1") {
  const remoteB64 = Buffer.from(remoteText, "utf-8").toString("base64");
  const calls: Record<string, unknown[]> = { "pulls.create": [] };
  return {
    calls,
    gh: {
      repos: {
        getContent: async () => ({
          data: { content: remoteB64, encoding: "base64", sha: remoteSha },
        }),
      },
      git: {
        getRef: async () => ({ data: { object: { sha: "BASE_SHA" } } }),
        createRef: async () => ({ data: {} }),
        createBlob: async () => ({ data: { sha: "BLOB" } }),
        createTree: async () => ({ data: { sha: "TREE" } }),
        createCommit: async () => ({ data: { sha: "COMMIT" } }),
        updateRef: async () => ({ data: {} }),
      },
      pulls: {
        create: async (args: unknown) => {
          calls["pulls.create"]!.push(args);
          return { data: { html_url: "https://github.com/x/y/pull/42" } };
        },
      },
    } as any,
  };
}

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

test("MarkdownEditScreen: loads remote and shows file path heading", async () => {
  setWysiwygFlag("source");
  const { gh } = makeFakeOctokit("## Hello {#hello}\n");
  render(
    wrap(
      <MarkdownEditScreen
        path="foundations/src/color-primitives.md"
        octokit={gh}
      />,
    ),
  );
  await waitFor(
    () => assert.ok(screen.getByText("foundations/src/color-primitives.md")),
    { timeout: 5000 },
  );
  // The path is the screen's ONE h1 (the shell adds none; that is tested on
  // the shell). Radix Heading defaults to h1, so this checks the level was
  // chosen, not inherited.
  const h1s = document.querySelectorAll("h1");
  assert.equal(h1s.length, 1, `h1s: ${[...h1s].map((h) => h.textContent).join(" | ")}`);
});

// The direct "Submit as PR" path was removed (a real incident: using both
// the direct button AND "Add to batch" produced duplicate PRs for one
// edit). Every edit now funnels through the batch/staging cart — this test
// asserts the non-workspace (empty-cart) render has no direct-submit button
// at all, and that "Add to batch" only stages (never opens a PR itself).
test("MarkdownEditScreen: non-workspace render has no direct 'Submit as PR' button; Add to batch only stages", async () => {
  setWysiwygFlag("source");
  submissionCartSingleton.clear();
  const { gh, calls } = makeFakeOctokit("## Hello {#hello}\n");
  render(
    wrap(
      <MarkdownEditScreen
        path="foundations/src/color-primitives.md"
        octokit={gh}
      />,
    ),
  );
  const addToBatch = await waitFor(
    () => screen.getByRole("button", { name: /add to batch/i }),
    { timeout: 5000 },
  );
  assert.equal(
    screen.queryByRole("button", { name: /submit as pr/i }),
    null,
    "the direct 'Submit as PR' button must be removed",
  );
  await act(async () => {
    fireEvent.click(addToBatch);
  });
  assert.equal(
    calls["pulls.create"]!.length,
    0,
    "Add to batch must stage only — it must never open a PR directly",
  );
  submissionCartSingleton.clear();
});

// ── #682: the outcome the editor exists to produce ──────────────────────────
//
// A load failure escalates to an alert Callout. The pull request — the one
// irreversible, outward-facing act — rendered as plain <Text> inside the button
// row, and reached the live region not at all. An author who sees no change
// clicks again, which is how #270/#271 became byte-identical PRs seven seconds
// apart. Its siblings already do this right: MetaEditScreen renders a green
// Callout, SubmissionStaging both renders one and announces.

async function submitOnlyThisFile() {
  setWysiwygFlag("source");
  submissionCartSingleton.clear();
  // A staged sibling puts the screen in workspace context, which is the only
  // render that offers the direct submit at all.
  submissionCartSingleton.add({
    path: "components/src/button/usage.md",
    content: "sibling",
    basedOnSha: "SHA_SIBLING",
    addedAt: Date.now(),
  });
  const { gh, calls } = makeFakeOctokit("## Hello {#hello}\n");
  render(
    wrap(<MarkdownEditScreen path="components/src/button/content.md" octokit={gh} />),
  );
  const submit = await waitFor(
    () => screen.getByRole("button", { name: /submit only this file/i }),
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(submit);
  });
  const confirm = await waitFor(
    () => screen.getByRole("button", { name: /yes, submit only this file/i }),
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(confirm);
  });
  await waitFor(() => {
    assert.equal(calls["pulls.create"]!.length, 1);
  }, { timeout: 5000 });
  return { calls };
}

test("MarkdownEditScreen: an opened pull request is a Callout, not text in the button row", async () => {
  await submitOnlyThisFile();
  // The Callout, identified by its own class rather than by a role: the role
  // was removed because `role="status"` is itself a polite live region and
  // duplicated the announcement below, reading the URL out character by
  // character beside the sentence.
  await waitFor(
    () => {
      const callouts = Array.from(
        document.querySelectorAll(".rt-CalloutRoot"),
      ).filter((el) =>
        /https:\/\/github\.com\/x\/y\/pull\/42/.test(el.textContent ?? ""),
      );
      assert.equal(
        callouts.length,
        1,
        `exactly one Callout must carry the PR url; found ${callouts.length}`,
      );
    },
    { timeout: 5000 },
  );
  // And it is not sitting inside the row of buttons any more. Pinned to the
  // row by testid: the first version walked up from
  // `.rt-Flex .rt-Button`, which is a toolbar elsewhere in the document, so
  // re-injecting the URL into the real submit row left the gate green.
  const rows = document.querySelectorAll('[data-testid="submit-row"]');
  assert.equal(
    rows.length,
    1,
    `exactly one submit row must carry the testid; found ${rows.length}. ` +
      "With two, querySelector would silently check the wrong one and this " +
      "gate would pass on the defect it names.",
  );
  const row = rows[0]!;
  assert.equal(
    /https:\/\/github\.com\/x\/y\/pull\/42/.test(row.textContent ?? ""),
    false,
    `the outcome must not render inside the button row, got: ${row.textContent}`,
  );
  submissionCartSingleton.clear();
});

test("MarkdownEditScreen: the outcome is announced once, not twice", async () => {
  await submitOnlyThisFile();
  // Two polite live regions saying the same thing is the defect this replaced:
  // the header region carries the sentence, and no Callout claims a live role.
  await waitFor(
    () => {
      const live = Array.from(
        document.querySelectorAll('[role="status"], [aria-live="polite"]'),
      ).filter((el) =>
        /https:\/\/github\.com\/x\/y\/pull\/42/.test(el.textContent ?? ""),
      );
      assert.equal(
        live.length,
        0,
        `no live region may read the PR url aloud; found ${live.length}`,
      );
    },
    { timeout: 5000 },
  );
  submissionCartSingleton.clear();
});

test("MarkdownEditScreen: an opened pull request is announced in the live region", async () => {
  resetAnnouncementsForTest();
  await submitOnlyThisFile();
  await waitFor(
    () => {
      assert.equal(
        getAnnouncement().text,
        "Pull request opened",
        `the live region said: ${JSON.stringify(getAnnouncement().text)}`,
      );
    },
    { timeout: 5000 },
  );
  submissionCartSingleton.clear();
});

// ── Round-3 finding: two modules disagreed about the first H2 ──────────────
//
// `sectionAnchors` normalises an unslugabble heading to null, so
// `countsBySection` moves the file's outgoing count onto the next H2 that has
// an anchor. `firstH2Anchor` walks `computeFocusedSection`, which does not
// normalise and returns "", so the two answered differently — and the file-
// scope outgoing management was then hidden on the one section whose pill
// carries the outgoing count. Migration stopped one module short.
test("firstH2Anchor skips a heading with no derivable anchor, as countsBySection does", () => {
  assert.equal(
    firstH2Anchor("## 🎯\n\nBody.\n\n## Tokens {#token-basics}\n\nMore.\n"),
    "token-basics",
  );
  // Unchanged where the first H2 does have one.
  assert.equal(
    firstH2Anchor("## Tokens {#token-basics}\n\nBody.\n\n## Motion\n\nMore.\n"),
    "token-basics",
  );
  // No H2 with an anchor at all.
  assert.equal(firstH2Anchor("## ---\n\nBody.\n"), null);
});

// ── The property, not the two instances ─────────────────────────────────────
//
// "Which heading owns file scope" is answered by two modules with two
// different scanners, and they have disagreed twice now through different
// doors: an anchor that derived to "" (round 3) and an H3 shadowing the first
// H2's slug (round 4). Guarding each instance would leave the third door open,
// so this asserts the agreement across every heading shape either scanner
// treats specially.
test("countsBySection and firstH2Anchor agree on which heading owns file scope", () => {
  setCachedIndexForTesting({
    entries: new Map(),
    scannedAt: 0,
    scannedPaths: ["foundations/src/tokens.md"],
    texts: new Map(),
  });
  const OUTGOING = 5;
  const shapes: Array<[string, string]> = [
    ["plain", "## Tokens\n\nA.\n\n## Motion\n\nB.\n"],
    ["H1 first", "# Title\n\n## Tokens\n\nA.\n"],
    ["H3 before any H2, different slug", "### Intro\n\nA.\n\n## Tokens\n\nB.\n"],
    ["H3 shadows the first H2", "### Tokens\n\nA.\n\n## Tokens\n\nB.\n"],
    [
      "H3 shadows the first H2, later H2 present",
      "### Tokens\n\nA.\n\n## Tokens\n\nB.\n\n## Motion\n\nC.\n",
    ],
    ["duplicate H2 slugs", "## Tokens\n\nA.\n\n## Tokens\n\nB.\n"],
    ["first H2 derives empty", "## 🎯\n\nA.\n\n## Tokens\n\nB.\n"],
    ["every H2 derives empty", "## ---\n\nA.\n\n## ***\n\nB.\n"],
    ["explicit anchor on an unslugabble title", "## 🎯 {#real}\n\nA.\n\n## Tokens\n\nB.\n"],
    ["no H2 at all", "### Only\n\nA.\n"],
    // Doors 3 and 4, from the round-5 review: the two scanners disagreed on
    // what an explicit anchor is (digit-leading allowed in one, not the
    // other) and on what a fence is (~~~ honoured by the reference index and
    // by neither scanner).
    ["whole title is a digit-leading anchor", "## {#2fa}\n\nA.\n\n## Tokens\n\nB.\n"],
    ["digit-leading anchor after a title", "## Tokens {#2fa}\n\nA.\n\n## Motion\n\nB.\n"],
    ["first H2 inside a ~~~ fence", "~~~\n## Fenced\n~~~\n\n## Tokens\n\nA.\n"],
    ["first H2 inside a ``` fence", "```\n## Fenced\n```\n\n## Tokens\n\nA.\n"],
    // Door five: an inner ``` must not close an outer ~~~. Both scanners read
    // the shared mask now, so this agrees for the right reason rather than by
    // being identically wrong.
    [
      "H2 inside a ``` nested in a ~~~",
      "~~~\n```\n## Hidden\n```\n~~~\n\n## Tokens\n\nA.\n",
    ],
    [
      "inline fence marker in prose above the first H2",
      "Write ``` to open one.\n\n## Tokens\n\nA.\n\nAnd ``` closes it.\n",
    ],
    // Door six. The table had no frontmatter shape at all, so a mutation
    // making one scanner mask from line 0 instead of the body left this
    // property green — the same blind spot as the nested fence: a property
    // only covers the shapes its table names.
    [
      "odd fence opener inside the frontmatter envelope",
      "---\ndescription: |\n  ```\n  code\n---\n\n## Tokens\n\nA.\n",
    ],
    [
      "balanced fence inside the frontmatter envelope",
      "---\ndescription: |\n  ```\n  code\n  ```\n---\n\n## Tokens\n\nA.\n",
    ],
    [
      "plain frontmatter, no fence",
      "---\ntitle: Tokens\n---\n\n## Tokens\n\nA.\n",
    ],
  ];

  for (const [label, text] of shapes) {
    const counts = countsBySection("foundations/src/tokens.md", text, OUTGOING);
    const carriers = [...counts.entries()]
      .filter(([, v]) => v === OUTGOING)
      .map(([k]) => k);
    const scope = firstH2Anchor(text);
    if (scope === null) {
      assert.equal(
        carriers.length,
        0,
        `${label}: no file scope, so nothing may carry the outgoing count; got ${JSON.stringify(carriers)}`,
      );
    } else {
      assert.deepEqual(
        carriers,
        [scope],
        `${label}: firstH2Anchor says ${JSON.stringify(scope)} owns file scope, but the outgoing count sits on ${JSON.stringify(carriers)}`,
      );
    }
  }
  setCachedIndexForTesting(null);
});
