# Foundations authoring guide

This guide is for the UX team. It explains how to update `foundations.md` so that the design plugin automatically picks up your changes.

## What you edit

**One file:** `foundations/src/foundations.md` in `volivarii/actian-ds-knowledge` (this repo).

Edit it directly on GitHub:
1. Open [foundations.md](./foundations.md) on GitHub.
2. Click the pencil icon at the top right.
3. Make your changes.
4. Scroll to the bottom, click **Commit changes**, choose **Create a new branch**, and create the PR.

You can also edit it in any Markdown editor (Typora, iA Writer, Obsidian, etc.) and paste the result back into the GitHub web editor.

## What happens after you commit

When you open or update a PR that touches `foundations.md`:
1. CI runs a parser script.
2. It regenerates JSON files in `foundations/dist/` automatically — one per H3 heading.
3. It also rewrites the `foundations.*` entries in `paths-manifest.json` to match.
4. It commits the JSON changes back to your branch with the message `chore(foundations): regenerate JSONs + manifest from foundations.md`.
5. It posts a comment on the PR summarizing what changed in plain language.

You don't need to install Node, run any script, or touch the JSON files. The PR appears with both your MD changes and the auto-generated JSON changes side by side.

## How the parser decides what to emit (v0.4.1+)

**The MD structure decides the JSON structure.** No fixed mapping table.

- Every `### H3` heading produces one JSON file, named after the slug of the heading text.
  - `### 2.11 Motion` → `motion.json`
  - `### 2.10 Background Tokens` → `background-tokens.json`
  - `### Color Usage Rules` → `color-usage-rules.json`
- Section numbers at the start (`2.1`, `2.11`, `3.6`) are stripped before slugging — they're for humans, not the parser.
- Leading emoji (`🟡`, `🟢`, etc.) at the start of a heading are also stripped.
- An H2 with no H3 children gets emitted at the H2 level instead.

**You can freely:**
- Renumber sections (`2.9 Motion` → `2.11 Motion`). The JSON file name stays `motion.json`.
- Rename sections (`Background Tokens` → `Backgrounds`). The JSON file name changes (`background-tokens.json` → `backgrounds.json`); CI updates `paths-manifest.json` to match.
- Remove sections. The JSON file is deleted from `foundations/dist/` and from the manifest.
- Add new sections. A new JSON file is created automatically.

The only constraint: don't put two sections with the SAME slug in the file. If you do, the parser appends `-1`, `-2`, etc. and emits a warning. (E.g., two `### Breakpoints` H3s → `breakpoints.json` + `breakpoints-1.json`.)

## Adding a token

Find the right table in `foundations.md` (e.g., section `2.1 Global Color`). Insert a new row. The columns vary per table — match what's already there.

Example:

| Token | Value | Status |
|-------|-------|--------|
| `--zen-color-blue-500` | `#0078A8` | 🟢 Shipped |
| `--zen-color-blue-600` | `#005C82` | 🟢 Shipped |
| `--zen-color-blue-650` | `#004A6C` | 🔵 In Review |   <-- new row

## Marking token status

Use these status emojis in the **Status** column (preferred vocabulary):

| Emoji | Meaning |
|---|---|
| 🟢 | Shipped — ready for use. JSON gets `"status": "shipped"`. |
| 🔵 | In Review — proposed, reviewed by leads. JSON gets `"status": "in-review"`. |
| 🟡 | Proposed — drafted, not yet reviewed. JSON gets `"status": "proposed"`. |

Legacy vocabulary still recognized (back-compat with component guidelines):

| Emoji | Meaning |
|---|---|
| ✅ | Current — no flag emitted. |
| ⚠️ | Proposed (synonym for 🟡). |
| ❌ | Deprecated. |
| 🚧 | In progress. |

If you write text after the emoji (e.g., `🟢 Shipped Q1 2026`), the parser keeps that text as `status_note` in the JSON.

If you use an emoji not in the lists above, the parser emits a warning suggesting the right vocabulary.

## The Motion section is special

A section whose H4 sub-headings include `Duration`, `Easing`, and `Delay` is detected as the "motion-shape" and gets structured output (`{ tokens, patterns }`). You can move/rename this section freely; detection is by content, not section number.

## Skipped sections

Two H2 sections are skipped by name: **Handoff Protocol** and **Related Guidelines**. They're process docs / pointers, not design-system data. To unskip, edit `SKIP_H2_SLUGS` in `scripts/foundations/derive-foundations.js`.

## When something goes wrong

- **PR comment says JSON didn't change but you expected it to:** check that your heading is at H3 depth (`###`) inside a non-skipped H2. Tables without a `|---|` separator row get parsed as plain text — the CI warning will tell you.
- **Auto-commit didn't appear:** the workflow only runs when `foundations.md` (or the parser scripts) change in the PR. If you only changed something else, no regeneration is triggered.
- **CI failed:** open the workflow run from the PR's checks tab. The parser logs warnings — these are non-fatal. A real error stops the run.

## What you don't need to do

- Don't edit any JSON file in `foundations/dist/`. They're auto-generated. CI will revert your edits and push back the regenerated version.
- Don't edit `paths-manifest.json` — the `foundations.*` entries are auto-regenerated by the derive script.
- Don't install Node or run any script locally.

## More info

- Parser source: [`scripts/foundations/derive-foundations.js`](../../scripts/foundations/derive-foundations.js)
- AST traversal: [`scripts/foundations/foundations-parser/ast-walk.js`](../../scripts/foundations/foundations-parser/ast-walk.js)
- Status emoji vocabulary: [`scripts/foundations/foundations-parser/status-emoji.js`](../../scripts/foundations/foundations-parser/status-emoji.js)
