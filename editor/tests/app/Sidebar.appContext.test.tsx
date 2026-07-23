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
import { submissionCartSingleton } from "../../src/drafts/store-instance";
import { setCachedIndexForTesting } from "../../src/lib/anchorIndex";

// Split out of Sidebar.test.tsx on purpose: every case here mounts the whole
// Sidebar, which now also builds the graph-derived product, record, and
// component lists. Node runs one worker per test FILE, so keeping these with
// the other 20-odd full mounts pushed that worker into an out-of-memory kill
// (every subtest passing, the file itself SIGKILLed). Separate file, separate
// budget.

afterEach(() => {
  cleanup();
  submissionCartSingleton.clear();
  try {
    sessionStorage.clear();
  } catch {
    /* sessionStorage may not be present in all jsdom builds */
  }
  setCachedIndexForTesting(null);
});

const LISTINGS = {
  "foundations/src": [{ name: "color-primitives.md", type: "file" as const }],
  "accessibility/src": [{ name: "principles.md", type: "file" as const }],
  "content/src/patterns": [{ name: "forms.md", type: "file" as const }],
  "content/src/product": [{ name: "lineage-specific-ui.md", type: "file" as const }],
  "content/src/writing": [{ name: "voice-and-tone.md", type: "file" as const }],
  "components/src": [{ name: "button", type: "dir" as const }],
};

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

const DATASET_PATH = "app-context/src/entities/dataset.md";
const DATASET_FILE = `---
_schema_version: 1
slug: dataset
label: Dataset
apps:
  - studio
---
A collection of records.
`;

const APP_CONTEXT_LISTINGS = {
  ...LISTINGS,
  "app-context/src/apps": [
    { name: "studio.md", type: "file" as const },
    { name: "data-connect.md", type: "file" as const },
  ],
  "app-context/src/entities": [{ name: "dataset.md", type: "file" as const }],
  "app-context/src/patterns": [],
};

/** Directory listings plus one real file blob, for the claim round-trip. */
function fakeGhWithFiles(
  listings: Record<string, Array<{ name: string; type: "file" | "dir" }>>,
  files: Record<string, string> = {},
) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path in files) {
          return {
            data: {
              content: btoa(files[path]!),
              encoding: "base64",
              sha: `fake-sha-${path}`,
            },
          };
        }
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

test("Sidebar: Products carries a New product affordance", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGhWithFiles(APP_CONTEXT_LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Products"));
  assert.ok(screen.getByRole("button", { name: "New product" }));
});

// The affordance has to survive the empty state, or the one team that most
// needs it (the first one, with nothing authored yet) cannot reach it.
test("Sidebar: an empty application context still offers New product", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGhWithFiles({
          ...LISTINGS,
          "app-context/src/apps": [],
          "app-context/src/entities": [],
          "app-context/src/patterns": [],
        })}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Application context"));
  assert.ok(screen.getByText("Products"));
  assert.ok(screen.getByRole("button", { name: "New product" }));
});

test("Sidebar: creating a product stages the product file and the joined record", async () => {
  submissionCartSingleton.clear();
  const selected: (string | null)[] = [];
  render(
    wrap(
      <Sidebar
        octokit={fakeGhWithFiles(APP_CONTEXT_LISTINGS, {
          [DATASET_PATH]: DATASET_FILE,
        })}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={(p) => selected.push(p)}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Products"));
  fireEvent.click(screen.getByRole("button", { name: "New product" }));

  fireEvent.change(await screen.findByLabelText("Product name"), {
    target: { value: "Data Fabric" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: /^Dataset/ }));
  fireEvent.click(screen.getByRole("button", { name: "Create product" }));

  await waitFor(() =>
    assert.ok(
      submissionCartSingleton.has("app-context/src/apps/data-fabric.md"),
    ),
  );
  const cart = submissionCartSingleton.list();
  const app = cart.find(
    (e) => e.path === "app-context/src/apps/data-fabric.md",
  );
  assert.ok(app);
  assert.match(app.content, /^label: Data Fabric$/m);
  assert.equal(app.basedOnSha, "");

  await waitFor(() => assert.ok(submissionCartSingleton.has(DATASET_PATH)));
  const joined = submissionCartSingleton.list().find((e) => e.path === DATASET_PATH);
  assert.ok(joined);
  assert.match(joined.content, /^apps:\n {2}- studio\n {2}- data-fabric$/m);
  assert.equal(joined.basedOnSha, `fake-sha-${DATASET_PATH}`);

  // The author lands in the product they just created.
  assert.ok(selected.includes("app-context/src/apps/data-fabric.md"));
  submissionCartSingleton.clear();
});

// The failure path is the whole point of reporting instead of dropping: if a
// claimed record cannot be joined, the author has to hear about it, and the
// product itself must still be staged.
test("Sidebar: a record that cannot be joined is reported, product still staged", async () => {
  submissionCartSingleton.clear();
  const alerts: string[] = [];
  const originalAlert = window.alert;
  window.alert = (msg?: unknown) => {
    alerts.push(String(msg));
  };
  try {
    render(
      wrap(
        <Sidebar
          octokit={fakeGhWithFiles(APP_CONTEXT_LISTINGS, {
            // No apps: key, so the join has nowhere to land.
            [DATASET_PATH]: "---\nslug: dataset\n---\nProse.\n",
          })}
          pendingPaths={new Set()}
          activePath={null}
          onSelect={() => {}}
        />,
      ),
    );
    await waitFor(() => screen.getByText("Products"));
    fireEvent.click(screen.getByRole("button", { name: "New product" }));
    fireEvent.change(await screen.findByLabelText("Product name"), {
      target: { value: "Data Fabric" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /^Dataset/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    await waitFor(() => assert.equal(alerts.length, 1));
    assert.match(alerts[0]!, /Dataset/);
    assert.match(alerts[0]!, /Data Fabric/);
    assert.ok(
      submissionCartSingleton.has("app-context/src/apps/data-fabric.md"),
      "the product must survive one failed join",
    );
    assert.equal(submissionCartSingleton.has(DATASET_PATH), false);
  } finally {
    window.alert = originalAlert;
    submissionCartSingleton.clear();
  }
});

// Entities and Features carry their own create affordance, and like Products
// they must be reachable when the layer is still empty.
test("Sidebar: every application-context section offers a way to create one", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGhWithFiles({
          ...LISTINGS,
          "app-context/src/apps": [],
          "app-context/src/entities": [],
          "app-context/src/patterns": [],
        })}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Products"));
  assert.ok(screen.getByText("Entities"));
  assert.ok(screen.getByText("Features"));
  assert.ok(screen.getByRole("button", { name: "New product" }));
  assert.ok(screen.getByRole("button", { name: "New entity" }));
  assert.ok(screen.getByRole("button", { name: "New feature" }));
});

test("Sidebar: creating an entity stages it against the chosen product", async () => {
  submissionCartSingleton.clear();
  const selected: (string | null)[] = [];
  render(
    wrap(
      <Sidebar
        octokit={fakeGhWithFiles(APP_CONTEXT_LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={(p) => selected.push(p)}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Entities"));
  fireEvent.click(screen.getByRole("button", { name: "New entity" }));

  fireEvent.change(await screen.findByLabelText("Name"), {
    target: { value: "Fixture Thing" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Studio" }));
  fireEvent.click(screen.getByRole("button", { name: "New entity" }));

  const path = "app-context/src/entities/fixture-thing.md";
  await waitFor(() => assert.ok(submissionCartSingleton.has(path)));
  const staged = submissionCartSingleton.list().find((e) => e.path === path);
  assert.ok(staged);
  assert.match(staged.content, /^label: Fixture Thing$/m);
  assert.match(staged.content, /^apps:\n {2}- studio$/m);
  assert.equal(staged.basedOnSha, "");
  assert.ok(selected.includes(path));
  submissionCartSingleton.clear();
});

// A name already in use must join the existing record rather than fork it.
test("Sidebar: naming an entity that exists joins it instead of forking it", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGhWithFiles(APP_CONTEXT_LISTINGS, {
          [DATASET_PATH]: DATASET_FILE,
        })}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Entities"));
  fireEvent.click(screen.getByRole("button", { name: "New entity" }));
  fireEvent.change(await screen.findByLabelText("Name"), {
    target: { value: "Dataset" },
  });
  assert.ok(screen.getByTestId("already-exists"));
  fireEvent.click(screen.getByRole("checkbox", { name: "Data Connect" }));
  fireEvent.click(screen.getByRole("button", { name: "Use the existing one" }));

  await waitFor(() => assert.ok(submissionCartSingleton.has(DATASET_PATH)));
  const staged = submissionCartSingleton
    .list()
    .find((e) => e.path === DATASET_PATH);
  assert.ok(staged);
  assert.match(staged.content, /^apps:\n {2}- studio\n {2}- data-connect$/m);
  assert.equal(
    submissionCartSingleton.has("app-context/src/entities/dataset-2.md"),
    false,
    "joining must not fork a second record",
  );
});

// The whole point of the collision check: it has to see the records this same
// session created, or it cannot catch the duplicates it is itself producing.
test("Sidebar: an entity created in this batch is found by the next collision check", async () => {
  render(
    wrap(
      <Sidebar
        octokit={fakeGhWithFiles(APP_CONTEXT_LISTINGS)}
        pendingPaths={new Set()}
        activePath={null}
        onSelect={() => {}}
      />,
    ),
  );
  await waitFor(() => screen.getByText("Entities"));

  // Create it once.
  fireEvent.click(screen.getByRole("button", { name: "New entity" }));
  fireEvent.change(await screen.findByLabelText("Name"), {
    target: { value: "Fixture Thing" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Studio" }));
  fireEvent.click(screen.getByRole("button", { name: "New entity" }));

  const path = "app-context/src/entities/fixture-thing.md";
  await waitFor(() => assert.ok(submissionCartSingleton.has(path)));
  const first = submissionCartSingleton.list().find((e) => e.path === path);
  assert.ok(first);

  // Name it again: the dialog must now know it exists.
  fireEvent.click(screen.getByRole("button", { name: "New entity" }));
  fireEvent.change(await screen.findByLabelText("Name"), {
    target: { value: "Fixture Thing" },
  });
  assert.match(
    screen.getByTestId("already-exists").textContent ?? "",
    /staged earlier in this batch/,
  );
  assert.equal(screen.queryByRole("button", { name: "New entity" }), null);

  // And joining it must not replace what is already staged there.
  fireEvent.click(screen.getByRole("checkbox", { name: "Data Connect" }));
  fireEvent.click(screen.getByRole("button", { name: "Use the existing one" }));
  await waitFor(() => {
    const after = submissionCartSingleton.list().find((e) => e.path === path);
    assert.ok(after);
    assert.match(after.content, /- studio/);
    assert.match(after.content, /- data-connect/);
  });
});
