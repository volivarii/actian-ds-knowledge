// Component Meters on the coverage dashboard.
//
// Split from meters.test.tsx and on JSDOM, not happy-dom, deliberately: mounting
// CoverageDashboard under happy-dom leaks a handle, and the file dies with a
// 30s SIGKILL that reads as a hang rather than as a failure. Its sibling
// CoverageDashboard.test.tsx has always used setup-dom for the same screen, so
// this follows the line the suite already draws — app-context screens on
// happy-dom, this one on JSDOM.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-happy-dom";
import { render, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { b64 } from "../helpers/fakeOctokit";
import { measure } from "../../src/lib/measure";
import {
  COMPONENT_SLOTS,
  componentSlotRecords,
} from "../../src/lib/slots";
import { summarize, type CoverageRow } from "../../src/lib/coverageLoader";

// happy-dom doesn't install sessionStorage; loadMediaIndex caches through it.
if (!globalThis.sessionStorage) {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    },
  });
}

afterEach(() => {
  cleanup();
  // loadMediaIndex caches the index in sessionStorage for 5 minutes. Without
  // this, the mediaOk:true test poisons the mediaOk:false test — the second
  // mount never reaches its 404 path and reads the first one's captures. State
  // that survives between tests makes the pair pass or fail on ORDER.
  globalThis.sessionStorage?.clear();
});

function mount(ui: React.ReactElement) {
  return render(<Theme>{ui}</Theme>);
}

function fixtureCoverageRows(): CoverageRow[] {
  const row = (
    slug: string,
    usage: "approved" | "inherited" | "not-started",
  ): CoverageRow => ({
    slug,
    component: slug,
    origin: "authored",
    a11yRefs: [],
    domains: {
      content: { status: "not-started" },
      usage: { status: usage },
      design: { status: "not-started" },
      behavior: { status: "not-started" },
      tokens: { status: "not-started" },
    },
  });
  return [row("a", "approved"), row("b", "inherited"), row("c", "not-started")];
}

test("the Component Usage meter and the loader's own summary agree", () => {
  // Two counts of one thing is the defect the Slot model exists to remove.
  // summarize() splits authored from inherited; the Slot counts both as filled
  // because inherited guidance EXISTS, it just lives on the category.
  const rows = fixtureCoverageRows();
  const meters = measure(
    componentSlotRecords(rows, new Set(["a"])),
    COMPONENT_SLOTS,
    "2026-09-03",
  );
  const usage = meters.find((m) => m.key === "usage");
  assert.ok(usage);
  assert.equal(usage.filled, 2);
  assert.equal(usage.total, 3);
  const counts = summarize(rows);
  assert.equal(
    counts.perDomain.usage.authored + counts.perDomain.usage.inherited,
    usage.filled,
  );
});

/** Serves just enough for loadCoverage + loadCapturedSlugs. */
function fakeGhServingCoverage(opts: { mediaOk: boolean }) {
  const meta = (slug: string) =>
    `component: "${slug}"\ndomains:\n  content: { status: approved }\n  usage: { status: not-started }\n  design: { status: not-started }\n  behavior: { status: not-started }\n  tokens: { status: not-started }\n`;
  const slugs = ["alpha", "beta"];
  const files: Record<string, string> = {
    "components/dist/registries/dskit.json": JSON.stringify({ components: {} }),
    "components/dist/media/_index.json": JSON.stringify({
      media: { alpha: { default: "components/dist/media/alpha/default.webp" } },
    }),
  };
  for (const s of slugs) files[`components/src/${s}/_meta.yml`] = meta(s);
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "components/src") {
          return { data: slugs.map((name) => ({ name, type: "dir" })) };
        }
        if (path === "components/dist/media/_index.json" && !opts.mediaOk) {
          const e = new Error("not found") as Error & { status: number };
          e.status = 404;
          throw e;
        }
        if (!(path in files)) {
          const e = new Error("not found") as Error & { status: number };
          e.status = 404;
          throw e;
        }
        return {
          data: { encoding: "base64", content: b64(files[path]!), sha: `sha-${path}` },
        };
      },
      listCommits: async () => ({ data: [] }),
    },
    git: {},
    pulls: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

test("the coverage dashboard renders the Component meters", async () => {
  const { CoverageDashboard } = await import("../../src/app/CoverageDashboard");
  const { container } = mount(
    <CoverageDashboard
      octokit={fakeGhServingCoverage({ mediaOk: true })}
      onOpenFile={() => {}}
    />,
  );
  await waitFor(() => {
    assert.ok((container.textContent ?? "").includes("Content"));
  });
  const text = container.textContent ?? "";
  // Two components, both content-approved, neither with usage.
  assert.ok(text.includes("2 of 2"), `Content meter missing from: ${text.slice(0, 500)}`);
  assert.ok(text.includes("0 of 2"), "Usage meter missing");
  assert.ok(text.includes("1 of 2"), "Capture meter missing (alpha has one)");
  assert.ok(!/\d+\s*%/.test(text), "a bare percentage reached the coverage dashboard");
});

test("an unreadable media index leaves the table standing and drops only Capture", async () => {
  const { CoverageDashboard } = await import("../../src/app/CoverageDashboard");
  const { container } = mount(
    <CoverageDashboard
      octokit={fakeGhServingCoverage({ mediaOk: false })}
      onOpenFile={() => {}}
    />,
  );
  await waitFor(() => {
    assert.ok((container.textContent ?? "").includes("Content"));
  });
  // The other Meters still render...
  assert.ok((container.textContent ?? "").includes("2 of 2"));
  // ...and Capture is absent rather than claiming zero across the registry.
  // `assert.equal(node, null)` SIGKILLs the runner when it fails, because the
  // diff walks a live DOM node. Compare a boolean so a failure reads as a
  // failure.
  assert.equal(container.querySelector('[data-meter="capture"]') === null, true);
  assert.ok(container.querySelector('[data-meter="usage"]'));
});

test("the Meters wait for the media index rather than dropping Capture mid-flight", async () => {
  // A two-state (Set | null) version rendered as soon as the coverage rows were
  // ready, so a slow media index meant the Capture Meter was silently absent and
  // then appeared. "Loading" and "cannot be measured" are different facts.
  let releaseIndex: (() => void) | null = null;
  const gate = new Promise<void>((r) => {
    releaseIndex = r;
  });
  const base = fakeGhServingCoverage({ mediaOk: true });
  const gh = {
    ...base,
    repos: {
      ...base.repos,
      getContent: async (args: { path: string }) => {
        if (args.path === "components/dist/media/_index.json") await gate;
        return base.repos.getContent(args);
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const { CoverageDashboard } = await import("../../src/app/CoverageDashboard");
  const { container } = mount(
    <CoverageDashboard octokit={gh} onOpenFile={() => {}} />,
  );
  // The rows land first; no Meter block may appear yet, because the shape of it
  // is not known until the index settles.
  await waitFor(() => {
    assert.ok((container.textContent ?? "").includes("Start authoring"));
  });
  assert.equal(
    container.querySelector("[data-meter]") === null,
    true,
    "Meters rendered before the media index settled, so Capture would pop in",
  );

  releaseIndex!();
  await waitFor(() => {
    assert.ok(container.querySelector('[data-meter="capture"]'));
  });
  assert.ok(container.querySelector('[data-meter="usage"]'));
});
