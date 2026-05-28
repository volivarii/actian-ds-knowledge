import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { Sidebar } from "../../src/app/Sidebar";

afterEach(() => {
  cleanup();
  try {
    sessionStorage.clear();
  } catch {
    /* sessionStorage may not be present in all jsdom builds */
  }
});

function fakeGh(
  listings: Record<string, Array<{ name: string; type: "file" | "dir" }>>,
) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (!(path in listings)) {
          const err = new Error("not found") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return { data: listings[path] };
      },
    },
  } as any;
}

const LISTINGS = {
  "foundations/src": [
    { name: "color-primitives.md", type: "file" as const },
    { name: "AUTHORING.md", type: "file" as const },
  ],
  "accessibility/src": [
    { name: "principles.md", type: "file" as const },
    { name: "AUTHORING.md", type: "file" as const },
  ],
  "content/src/patterns": [
    { name: "forms.md", type: "file" as const },
    { name: "onboarding.md", type: "file" as const },
  ],
  "content/src/product": [
    { name: "lineage-specific-ui.md", type: "file" as const },
  ],
  "content/src/writing": [
    { name: "voice-and-tone.md", type: "file" as const },
    { name: "words-to-avoid.md", type: "file" as const },
  ],
  "components/src": [
    { name: "button", type: "dir" as const },
    { name: "checkbox", type: "dir" as const },
    { name: "categories", type: "dir" as const },
  ],
};

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

/** Click the header for `label` to flip its collapsed state. */
function toggleSection(label: string) {
  const header = screen.getByText(label).closest('[role="button"]')!;
  fireEvent.click(header);
}

test("Sidebar: renders Foundations + Accessibility entries (after expand)", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Foundations"));
  toggleSection("Foundations");
  toggleSection("Accessibility");
  assert.ok(screen.getByText("Color Primitives"));
  assert.ok(screen.getByText("Principles"));
});

test("Sidebar: excludes AUTHORING.md", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Foundations"));
  toggleSection("Foundations");
  assert.ok(screen.getByText("Color Primitives"));
  assert.equal(screen.queryByText("Authoring"), null);
});

test("Sidebar: excludes categories (skip-dir)", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Components"));
  toggleSection("Components");
  assert.ok(screen.getByText("Button"));
  assert.equal(screen.queryByText("Categories"), null);
});

test("Sidebar: click dispatches onSelect with full path", async () => {
  const calls: (string | null)[] = [];
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={(p) => calls.push(p)}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Foundations"));
  toggleSection("Foundations");
  fireEvent.click(screen.getByText("Color Primitives"));
  assert.deepEqual(calls, ["foundations/src/color-primitives.md"]);
});

test("Sidebar: renders a Coverage entry at the top", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Coverage"));
  assert.ok(screen.getByText("Coverage"));
});

test("Sidebar: clicking Coverage calls onSelect with null", async () => {
  const calls: (string | null)[] = [];
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={"foundations/src/color-primitives.md"}
        onSelect={(p) => calls.push(p)}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Coverage"));
  fireEvent.click(screen.getByText("Coverage"));
  assert.deepEqual(calls, [null]);
});

test("Sidebar: renders Content — Patterns/Product/Writing entries (after expand)", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Content — Patterns"));
  assert.ok(screen.getByText("Content — Patterns"));
  assert.ok(screen.getByText("Content — Product"));
  assert.ok(screen.getByText("Content — Writing"));
  toggleSection("Content — Patterns");
  toggleSection("Content — Product");
  toggleSection("Content — Writing");
  assert.ok(screen.getByText("Forms"));
  assert.ok(screen.getByText("Onboarding"));
  assert.ok(screen.getByText("Lineage Specific Ui"));
  assert.ok(screen.getByText("Voice And Tone"));
  assert.ok(screen.getByText("Words To Avoid"));
});

test("Sidebar: clicking content/src entry dispatches full path", async () => {
  const calls: (string | null)[] = [];
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={(p) => calls.push(p)}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Content — Patterns"));
  toggleSection("Content — Patterns");
  fireEvent.click(screen.getByText("Forms"));
  assert.deepEqual(calls, ["content/src/patterns/forms.md"]);
});

test("Sidebar: all sections collapsed by default", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Foundations"));
  // No section items rendered initially
  assert.equal(screen.queryByText("Color Primitives"), null);
  assert.equal(screen.queryByText("Principles"), null);
  assert.equal(screen.queryByText("Forms"), null);
  assert.equal(screen.queryByText("Button"), null);
  // All section headers report aria-expanded=false
  for (const label of [
    "Foundations",
    "Accessibility",
    "Content — Patterns",
    "Content — Product",
    "Content — Writing",
    "Components",
  ]) {
    const header = screen.getByText(label).closest('[role="button"]')!;
    assert.equal(
      header.getAttribute("aria-expanded"),
      "false",
      `${label} should be collapsed by default`,
    );
  }
});

test("Sidebar: Foundations section toggles", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Foundations"));
  const header = screen.getByText("Foundations").closest('[role="button"]')!;
  assert.equal(header.getAttribute("aria-expanded"), "false");
  fireEvent.click(header);
  assert.equal(header.getAttribute("aria-expanded"), "true");
  assert.ok(screen.getByText("Color Primitives"));
  fireEvent.click(header);
  assert.equal(header.getAttribute("aria-expanded"), "false");
  assert.equal(screen.queryByText("Color Primitives"), null);
});

test("Sidebar: Components section toggles and preserves Show all", async () => {
  // 25 components: forces the cap to engage when section is expanded.
  const many = Array.from({ length: 25 }, (_, i) => ({
    name: `comp-${String(i).padStart(2, "0")}`,
    type: "dir" as const,
  }));
  const listings = { ...LISTINGS, "components/src": many };
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(listings)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Components"));
  const header = screen.getByText("Components").closest('[role="button"]')!;
  // Default collapsed: no items, no Show all
  assert.equal(header.getAttribute("aria-expanded"), "false");
  assert.equal(screen.queryByText("Comp 00"), null);
  assert.equal(screen.queryByText("Show all (25)"), null);

  // Expand: cap engages (20 of 25 visible + Show all link)
  fireEvent.click(header);
  await waitFor(() => screen.getByText("Comp 00"));
  assert.equal(header.getAttribute("aria-expanded"), "true");
  assert.ok(screen.getByText("Comp 19"));
  assert.equal(screen.queryByText("Comp 20"), null);
  assert.ok(screen.getByText("Show all (25)"));

  // Click "Show all" — un-caps within the expanded section
  fireEvent.click(screen.getByText("Show all (25)"));
  assert.ok(screen.getByText("Comp 24"));

  // Collapse — hides everything including the now-uncapped list
  fireEvent.click(header);
  assert.equal(header.getAttribute("aria-expanded"), "false");
  assert.equal(screen.queryByText("Comp 00"), null);
});

test("Sidebar: section collapse state persists via sessionStorage", async () => {
  const { unmount } = render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Foundations"));
  // Expand Foundations (default is collapsed)
  toggleSection("Foundations");
  unmount();
  // Remount — Foundations should remember the expanded state
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Foundations"));
  const header = screen.getByText("Foundations").closest('[role="button"]')!;
  assert.equal(header.getAttribute("aria-expanded"), "true");
  assert.ok(screen.getByText("Color Primitives"));
});

test("Sidebar: hides empty content/src groups (e.g. 404 dirs)", async () => {
  // Drop patterns/product/writing listings — should cause 404 from fakeGh
  // and the corresponding headings should not render.
  const partial = {
    "foundations/src": LISTINGS["foundations/src"],
    "accessibility/src": LISTINGS["accessibility/src"],
    "components/src": LISTINGS["components/src"],
  };
  render(
    wrap(
      <Sidebar
        octokit={fakeGh(partial)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Foundations"));
  assert.equal(screen.queryByText("Content — Patterns"), null);
  assert.equal(screen.queryByText("Content — Product"), null);
  assert.equal(screen.queryByText("Content — Writing"), null);
});

test("Sidebar: shows draft-dot for paths in pendingPaths (when expanded)", async () => {
  const pending = new Set(["foundations/src/color-primitives.md"]);
  const { container } = render(
    wrap(
      <Sidebar
        octokit={fakeGh(LISTINGS)}
        pendingPaths={pending}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Foundations"));
  toggleSection("Foundations");
  const dots = container.querySelectorAll(".draft-dot");
  assert.equal(dots.length, 1);
});

// ---------------------------------------------------------------------------
// New affordances: +Add section, drag grips, hover trash, ordered display
// ---------------------------------------------------------------------------

/**
 * Extended fake that handles both directory listings and _order.json file
 * entries. Pass `orderManifests` as a map of domainPath → slug array, e.g.
 * { "foundations/src": ["intro", "tokens"] }. Any path ending in
 * `_order.json` whose parent dir key exists in `orderManifests` will return
 * a synthetic base64-encoded file response with a fixed SHA.
 */
function fakeGhWithOrders(
  listings: Record<string, Array<{ name: string; type: "file" | "dir" }>>,
  orderManifests: Record<string, string[]> = {},
) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        // Handle _order.json paths
        if (path.endsWith("/_order.json")) {
          const dir = path.replace("/_order.json", "");
          if (dir in orderManifests) {
            const json = JSON.stringify(orderManifests[dir]);
            // btoa is available in jsdom (wired via setup-dom)
            const encoded = btoa(json);
            return {
              data: {
                content: encoded,
                encoding: "base64",
                sha: "fake-sha-order",
              },
            };
          }
          const err = new Error("not found") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        // Fall back to directory listings
        if (!(path in listings)) {
          const err = new Error("not found") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return { data: listings[path] };
      },
    },
  } as any;
}

test("Sidebar — renders + Add section button on each curatable group header", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGhWithOrders(LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Foundations"));

  // Foundations, Accessibility, Content — Patterns, Content — Product,
  // Content — Writing all have an "Add * section" button.
  const addButtons = screen.queryAllByRole("button", {
    name: /add .* section/i,
  });
  assert.ok(
    addButtons.length >= 5,
    `expected ≥5 +Add buttons, got ${addButtons.length}`,
  );

  // Components group does NOT get one (null onAdd)
  const componentsAdd = screen.queryByRole("button", {
    name: /add components section/i,
  });
  assert.equal(componentsAdd, null);
});

test("Sidebar — renders a reorder grip on each foundations row", async () => {
  const { container } = render(
    wrap(
      <Sidebar
        octokit={fakeGhWithOrders(LISTINGS, {
          "foundations/src": ["color-primitives"],
        })}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Foundations"));
  // Expand the Foundations section so rows are mounted
  toggleSection("Foundations");
  await waitFor(() => screen.getByText("Color Primitives"));

  const grips = container.querySelectorAll("[data-reorder-grip]");
  assert.ok(
    grips.length >= 1,
    `expected at least one drag grip, got ${grips.length}`,
  );
  // Each grip is a span role="button" with aria-label="Reorder <slug>"
  const grip = grips[0]!;
  assert.equal(grip.getAttribute("role"), "button");
  assert.ok(
    grip.getAttribute("aria-label")?.startsWith("Reorder "),
    `expected aria-label starting with "Reorder ", got "${grip.getAttribute("aria-label")}"`,
  );
});

test("Sidebar — renders a trash button on a foundations row but not on a components row", async () => {
  const { container } = render(
    wrap(
      <Sidebar
        octokit={fakeGhWithOrders(LISTINGS, {
          "foundations/src": ["color-primitives"],
        })}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Foundations"));
  // Expand Foundations to get its rows
  toggleSection("Foundations");
  await waitFor(() => screen.getByText("Color Primitives"));

  const trashButtons = screen.queryAllByRole("button", { name: /^delete /i });
  assert.ok(
    trashButtons.length >= 1,
    `expected ≥1 trash button in foundations rows, got ${trashButtons.length}`,
  );

  // Expand Components — its rows must NOT have trash buttons
  toggleSection("Components");
  await waitFor(() => screen.getByText("Button"));

  // Count all trash buttons again; should still be the same count as before
  // (components don't add any)
  const trashAfterComponents = screen.queryAllByRole("button", {
    name: /^delete /i,
  });
  const componentTrash = container.querySelector(
    "#list-components [aria-label^='Delete']",
  );
  assert.equal(
    componentTrash,
    null,
    "components rows must not have a trash button",
  );
  assert.equal(
    trashAfterComponents.length,
    trashButtons.length,
    "expanding Components must not add new trash buttons",
  );
});

test("Sidebar — foundations rows follow _order.json sequence, not directory order", async () => {
  // Directory listing returns files in reverse alphabetical order (tokens first,
  // then intro). _order.json declares ["intro", "tokens"], so rendered order
  // must be Intro → Tokens regardless of the listing order.
  const reversedListings = {
    ...LISTINGS,
    "foundations/src": [
      { name: "tokens.md", type: "file" as const },
      { name: "intro.md", type: "file" as const },
    ],
  };

  const { container } = render(
    wrap(
      <Sidebar
        octokit={fakeGhWithOrders(reversedListings, {
          "foundations/src": ["intro", "tokens"],
        })}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );

  await waitFor(() => screen.getByText("Foundations"));
  toggleSection("Foundations");
  await waitFor(() => screen.getByText("Intro"));

  // Collect all <li> elements inside the foundations list
  const items = container.querySelectorAll("#list-foundations li");
  const labels = Array.from(items).map((li) => li.textContent?.trim() ?? "");

  const introIdx = labels.findIndex((l) => l.includes("Intro"));
  const tokensIdx = labels.findIndex((l) => l.includes("Tokens"));

  assert.ok(
    introIdx >= 0,
    `"Intro" row not found; labels=${JSON.stringify(labels)}`,
  );
  assert.ok(
    tokensIdx >= 0,
    `"Tokens" row not found; labels=${JSON.stringify(labels)}`,
  );
  assert.ok(
    introIdx < tokensIdx,
    `expected Intro (idx ${introIdx}) before Tokens (idx ${tokensIdx})`,
  );
});
