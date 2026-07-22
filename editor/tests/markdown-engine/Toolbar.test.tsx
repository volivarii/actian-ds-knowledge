import { test } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { Toolbar } from "../../src/markdown-engine/Toolbar";

function mountWithView(initialDoc: string) {
  const view = new EditorView({
    state: EditorState.create({ doc: initialDoc }),
  });
  const { container } = render(
    <Theme>
      <Toolbar view={view} />
    </Theme>,
  );
  return { view, container };
}

// Minimal CM6 view stub — only the bits the toolbar touches.
function stubView() {
  return {
    state: {
      selection: { main: { from: 0, to: 0 } },
      doc: { lineAt: () => ({ from: 0, to: 0, text: "" }) },
      sliceDoc: () => "",
    },
    dispatch: () => {},
    focus: () => {},
  } as any;
}

function fakeGh() {
  return {
    repos: {
      getContent: async () => ({ data: { content: "", encoding: "base64" } }),
    },
  } as any;
}

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

test("Toolbar: bold wraps selection with **...**", () => {
  const { view } = mountWithView("hello world");
  view.dispatch({ selection: { anchor: 0, head: 5 } });
  fireEvent.click(screen.getByRole("button", { name: /bold/i }));
  assert.equal(view.state.doc.toString(), "**hello** world");
  cleanup();
});

test("Toolbar: italic wraps selection with *...*", () => {
  const { view } = mountWithView("hello");
  view.dispatch({ selection: { anchor: 0, head: 5 } });
  fireEvent.click(screen.getByRole("button", { name: /italic/i }));
  assert.equal(view.state.doc.toString(), "*hello*");
  cleanup();
});

// Inline code button removed in favor of Cmd+E / backtick typing
// (toolbar redesign). Bold/italic/link remain the inline group.

test("Toolbar: blockquote prefixes current line with '> '", () => {
  const { view } = mountWithView("a thought");
  view.dispatch({ selection: { anchor: 0, head: 0 } });
  fireEvent.click(screen.getByRole("button", { name: /blockquote/i }));
  assert.equal(view.state.doc.toString(), "> a thought");
  cleanup();
});

test("Toolbar: table inserts a 2x2 markdown table at cursor", () => {
  const { view } = mountWithView("");
  view.dispatch({ selection: { anchor: 0, head: 0 } });
  fireEvent.click(screen.getByRole("button", { name: /insert table/i }));
  assert.match(view.state.doc.toString(), /\| Column 1 \| Column 2 \|/);
  assert.match(view.state.doc.toString(), /\| --- \| --- \|/);
  cleanup();
});

test("Toolbar: unordered list prefixes current line with '- '", () => {
  const { view } = mountWithView("item one");
  view.dispatch({ selection: { anchor: 3, head: 3 } });
  fireEvent.click(screen.getByRole("button", { name: /bullet list/i }));
  assert.equal(view.state.doc.toString(), "- item one");
  cleanup();
});

test("Toolbar: ordered list prefixes current line with '1. '", () => {
  const { view } = mountWithView("item one");
  view.dispatch({ selection: { anchor: 0, head: 0 } });
  fireEvent.click(screen.getByRole("button", { name: /numbered list/i }));
  assert.equal(view.state.doc.toString(), "1. item one");
  cleanup();
});

test("Toolbar: anchor button appends {#auto-slug} on heading line", () => {
  const { view } = mountWithView("## New Section");
  view.dispatch({ selection: { anchor: 14, head: 14 } });
  fireEvent.click(screen.getByRole("button", { name: /anchor/i }));
  assert.equal(view.state.doc.toString(), "## New Section {#new-section}");
  cleanup();
});

test("Toolbar: anchor button is inert on a non-heading line", () => {
  const { view } = mountWithView("plain text");
  view.dispatch({ selection: { anchor: 5, head: 5 } });
  fireEvent.click(screen.getByRole("button", { name: /anchor/i }));
  // Heading anchors only (Slice 1): a non-heading click is a no-op.
  assert.equal(view.state.doc.toString(), "plain text");
  cleanup();
});

test("Toolbar: anchor button is inert on a heading-shaped line inside a code fence", () => {
  const doc = "```\n## Not a heading\n```";
  const { view } = mountWithView(doc);
  const at = doc.indexOf("## Not a heading") + 3;
  view.dispatch({ selection: { anchor: at, head: at } });
  fireEvent.click(screen.getByRole("button", { name: /anchor/i }));
  // A heading-shaped line inside a fence must NOT be anchored: doc unchanged.
  assert.equal(view.state.doc.toString(), doc);
  cleanup();
});

test("Toolbar: anchor button derives a UNIQUE slug against existing anchors", () => {
  const doc = "## Overview {#overview}\n\nprose\n\n## Overview";
  const { view } = mountWithView(doc);
  // Cursor on the second (unanchored) "## Overview" line.
  const secondHeadingAt = doc.lastIndexOf("## Overview") + 5;
  view.dispatch({
    selection: { anchor: secondHeadingAt, head: secondHeadingAt },
  });
  fireEvent.click(screen.getByRole("button", { name: /anchor/i }));
  assert.match(view.state.doc.toString(), /## Overview \{#overview-2\}$/);
  cleanup();
});

test("Toolbar: code block inserts ``` fenced block at cursor", () => {
  const { view } = mountWithView("");
  view.dispatch({ selection: { anchor: 0, head: 0 } });
  fireEvent.click(screen.getByRole("button", { name: /code block/i }));
  assert.match(view.state.doc.toString(), /^[\s\S]*```[\s\S]*```[\s\S]*$/);
  cleanup();
});

test("shows the media picker trigger in a component context", () => {
  cleanup();
  render(
    wrap(
      <Toolbar view={stubView()} octokit={fakeGh()} componentSlug="button" />,
    ),
  );
  assert.ok(
    screen.queryByRole("button", { name: /insert media/i }),
    "media trigger present",
  );
  cleanup();
});

test("hides the media trigger when there is no component slug", () => {
  cleanup();
  render(
    wrap(<Toolbar view={stubView()} octokit={fakeGh()} componentSlug={null} />),
  );
  assert.equal(
    screen.queryByRole("button", { name: /insert media/i }),
    null,
    "media trigger absent for non-component files",
  );
  cleanup();
});

test("never renders the old free-text <Media src> button", () => {
  cleanup();
  render(
    wrap(
      <Toolbar view={stubView()} octokit={fakeGh()} componentSlug="button" />,
    ),
  );
  assert.equal(
    screen.queryByRole("button", { name: /Insert Media component/i }),
    null,
  );
  cleanup();
});
