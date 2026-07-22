import { test } from "node:test";
import assert from "node:assert/strict";
import { renameAnchorInText } from "../../src/markdown-engine/anchorRename";

// The apply contract, unit-scoped: MarkdownEditScreen's rename handler passes
// `renameAnchorInText(text, old, new)` straight to setText and re-seeds both
// editors with it (via the remountNonce bump). This proves the payload it
// produces, without mounting the heavy screen (a known CI-hang trap).
test("anchor rename apply: the setText payload renames marker + same-file links only", () => {
  const text =
    "## Overview {#overview}\n\nSee [top](#overview) and [modal](modal#overview).\n";
  const payload = renameAnchorInText(text, "overview", "intro");
  assert.equal(
    payload,
    "## Overview {#intro}\n\nSee [top](#intro) and [modal](modal#overview).\n",
  );
});

test("anchor rename apply: re-seeding with the payload is idempotent", () => {
  const text = "## Overview {#overview}\n\nSee [top](#overview).\n";
  const payload = renameAnchorInText(text, "overview", "intro");
  // The old slug is gone from the payload, so applying the same rename again
  // (as a stray re-seed would) leaves it byte-stable.
  assert.equal(renameAnchorInText(payload, "overview", "intro"), payload);
});
