import { test } from "node:test";
import assert from "node:assert/strict";
import { humanizeSlug, contentFilesFromListing } from "../../src/lib/contentFiles";

test("humanizeSlug: kebab slug to sentence case", () => {
  assert.equal(humanizeSlug("forms"), "Forms");
  assert.equal(humanizeSlug("notifications-and-messaging"), "Notifications and messaging");
});

test("contentFilesFromListing: maps md files to titled, real src paths; skips AUTHORING + non-md", () => {
  const out = contentFilesFromListing([
    { dir: "patterns", files: ["forms.md", "wizards.md", "AUTHORING.md", "notes.txt"] },
    { dir: "writing", files: ["voice-and-tone.md"] },
  ]);
  assert.deepEqual(out, [
    { title: "Forms", path: "content/src/patterns/forms.md" },
    { title: "Wizards", path: "content/src/patterns/wizards.md" },
    { title: "Voice and tone", path: "content/src/writing/voice-and-tone.md" },
  ]);
});
