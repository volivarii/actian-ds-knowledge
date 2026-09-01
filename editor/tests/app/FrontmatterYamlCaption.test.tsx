// jsdom, not happy-dom (this screen mounts CodeMirror).
import "../setup-dom";
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
// The form surface uses Radix Tooltip, which needs the provider a <Theme>
// supplies. Production always renders inside one (App wraps the whole editor);
// only the raw YAML pane happened not to need it.
import { Theme } from "@radix-ui/themes";
import { FrontmatterBodyEditScreen } from "../../src/app/FrontmatterBodyEditScreen";
import { submissionCartSingleton } from "../../src/drafts/store-instance";
import { setWysiwygFlag } from "../helpers/editorSurface";

// These suites exercise the YAML FRONTMATTER pane; the body surface below it is
// incidental. Pin it to the source pane: the rich surface cannot mount under
// jsdom at all (only tests/setup-happy-dom.ts installs what ProseMirror needs),
// and app-context rich-body coverage lives in appContextWysiwyg.test.tsx.
beforeEach(() => setWysiwygFlag("source"));

afterEach(() => {
  cleanup();
  submissionCartSingleton.clear();
});

const APP_SCHEMA_PATH = new URL(
  "../../../schemas/app-context-app.json",
  import.meta.url,
).pathname;
const ENTITY_SCHEMA_PATH = new URL(
  "../../../schemas/app-context-entity.json",
  import.meta.url,
).pathname;

const APP_DESCRIPTION =
  "Frontmatter of app-context/src/apps/<slug>.md. Describes an Actian application's identity, header variant, navigation structure, and behavioural signals.";
const ENTITY_DESCRIPTION =
  "Frontmatter of app-context/src/entities/<slug>.md. The prose `description` lives in the markdown body, not here.";

const APP_RECORD = [
  "---",
  "_schema_version: 1",
  "slug: studio",
  "label: Studio",
  "header:",
  "  type: Studio",
  "sidebar:",
  "  - label: Pipelines",
  "    id: pipelines",
  "---",
  "An app record.",
  "",
].join("\n");

const ENTITY_RECORD = [
  "---",
  "_schema_version: 1",
  "slug: dataset",
  "label: Dataset",
  "properties:",
  "  - name",
  "relationships:",
  "  contains:",
  "    - field",
  "apps:",
  "  - studio",
  "---",
  "A dataset asset.",
  "",
].join("\n");

/** Minimal Octokit stand-in serving one record + its schema, matching the
 *  production call shape (`gh.repos.getContent`, not `gh.rest.repos...`). */
function fakeOctokit(recordPath: string, record: string, schemaPath: string) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        const text =
          path === recordPath ? record : readFileSync(schemaPath, "utf8");
        return {
          data: {
            content: Buffer.from(text, "utf8").toString("base64"),
            encoding: "base64",
            sha: "deadbeef",
          },
        };
      },
    },
  } as never;
}

/** Idempotent: app-context records now OPEN expanded (the form is what they
 *  lead with, so leaving it collapsed would hide every field), and opening the
 *  source view expands too. Clicking unconditionally would collapse it. */
function expandFrontmatter() {
  const btn = screen.getByRole("button", { name: "Toggle frontmatter" });
  if (btn.textContent === "Show") fireEvent.click(btn);
}

/** The opposite, for the one test that needs a collapsed pane on purpose. */
function collapseFrontmatter() {
  const btn = screen.getByRole("button", { name: "Toggle frontmatter" });
  if (btn.textContent === "Hide") fireEvent.click(btn);
}

// Catches: a caption that renders a hardcoded per-domain string instead of
// the schema's own `description`. If the implementation hardcoded ANY fixed
// text (even a plausible-looking one), it could not simultaneously match
// both this app-schema wording AND the differently-worded entity-schema
// assertion below.
/** The raw YAML is a source view now, not what a record opens with (F9), so
 *  every caption assertion below opens the pane first. */
async function openSource() {
  const btn = await screen.findByRole(
    "button",
    { name: /view source/i },
    { timeout: 5000 },
  );
  fireEvent.click(btn);
  return screen.findByTestId("yaml-frontmatter-editor", {}, { timeout: 5000 });
}

test("the YAML pane caption shows the app schema's own root description, not a hardcoded string, once expanded", async () => {
  const { container } = render(
    <Theme><FrontmatterBodyEditScreen
      path="app-context/src/apps/studio.md"
      schemaKey="app-context-app"
      uiSchema={{}}
      surface="yaml"
      octokit={fakeOctokit(
        "app-context/src/apps/studio.md",
        APP_RECORD,
        APP_SCHEMA_PATH,
      )}
    /></Theme>,
  );
  await openSource();
  expandFrontmatter();

  assert.ok(
    container.textContent?.includes(APP_DESCRIPTION),
    "expected the app schema's own description in the caption",
  );
  assert.ok(
    container.textContent?.includes("Hover a key"),
    "expected the hover hint alongside the description",
  );
  assert.ok(
    !container.textContent?.includes(ENTITY_DESCRIPTION),
    "must not show a different schema's description",
  );
});

// Same guarantee from the other domain: a DIFFERENT schema produces a
// DIFFERENT caption. Together with the test above, a fixed string (or a
// caption that always shows the FIRST schema ever loaded) fails one of the
// two.
test("the YAML pane caption shows the entity schema's own root description for an entity record, once expanded", async () => {
  const { container } = render(
    <Theme><FrontmatterBodyEditScreen
      path="app-context/src/entities/dataset.md"
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={fakeOctokit(
        "app-context/src/entities/dataset.md",
        ENTITY_RECORD,
        ENTITY_SCHEMA_PATH,
      )}
    /></Theme>,
  );
  await openSource();
  expandFrontmatter();

  assert.ok(
    container.textContent?.includes(ENTITY_DESCRIPTION),
    "expected the entity schema's own description in the caption",
  );
  assert.ok(
    !container.textContent?.includes(APP_DESCRIPTION),
    "must not show the app schema's description",
  );
});

// Guards the other side of the same conditional: no description in the
// schema must not leak a stray "undefined" into the UI, nor show the hover
// hint with nothing to caption. Expanded, so this is exercising the
// "description absent" branch specifically, not just the collapse gate
// covered separately below.
test("no caption (and no orphan hover hint) renders when the schema has no root description, even once expanded", async () => {
  const octokit = {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        const text =
          path === "app-context/src/apps/bare.md"
            ? "---\nfoo: bar\n---\nBody.\n"
            : JSON.stringify({ type: "object", properties: {} });
        return {
          data: {
            content: Buffer.from(text, "utf8").toString("base64"),
            encoding: "base64",
            sha: "deadbeef",
          },
        };
      },
    },
  } as never;

  const { container } = render(
    <Theme><FrontmatterBodyEditScreen
      path="app-context/src/apps/bare.md"
      schemaKey="app-context-app-bare-test"
      uiSchema={{}}
      surface="yaml"
      octokit={octokit}
    /></Theme>,
  );
  await openSource();
  expandFrontmatter();

  assert.ok(
    !container.textContent?.includes("undefined"),
    "a missing description must not leak the literal string 'undefined'",
  );
  assert.ok(
    !container.textContent?.includes("Hover a key"),
    "the hover hint must not render with no description to caption",
  );
});

// The actual defect this task fixes: every test above now expands the pane
// first, which is necessary because — before the fix — the caption rendered
// regardless of fmCollapsed. A record no longer opens collapsed, so this test
// collapses the pane itself; without it the
// orphan-hint regression (caption text, including "Hover a key", sitting
// above a hidden pane with nothing to hover) would go uncaught by this
// entire file, exactly as it did before.
test("the caption does not render while the pane is collapsed (no orphan hover hint above nothing hoverable)", async () => {
  const { container } = render(
    <Theme><FrontmatterBodyEditScreen
      path="app-context/src/apps/studio.md"
      schemaKey="app-context-app"
      uiSchema={{}}
      surface="yaml"
      octokit={fakeOctokit(
        "app-context/src/apps/studio.md",
        APP_RECORD,
        APP_SCHEMA_PATH,
      )}
    /></Theme>,
  );
  await openSource();
  collapseFrontmatter();

  assert.equal(
    screen.getByRole("button", { name: "Toggle frontmatter" }).textContent,
    "Show",
    "sanity: the pane must actually be collapsed for this assertion to mean anything",
  );
  assert.ok(
    !container.textContent?.includes(APP_DESCRIPTION),
    "the schema description must not render while the pane is collapsed",
  );
  assert.ok(
    !container.textContent?.includes("Hover a key"),
    "the hover hint must not render above a hidden pane",
  );
});
