// Component Meters on the coverage dashboard.
//
// Split from meters.test.tsx only to keep the app-context screens and this one
// in separate files; both environments work. An earlier header here claimed
// this file was "on JSDOM, not happy-dom, deliberately" because mounting
// CoverageDashboard under happy-dom "leaks a handle and the file dies with a
// 30s SIGKILL" — while the file imported happy-dom, and while the SIGKILL had
// nothing to do with the environment. It was two stacked bugs in the tests
// themselves: loadMediaIndex caches in sessionStorage so one test poisoned the
// next, and `assert.equal` on a live DOM node kills the runner when it fails,
// so an ordinary assertion failure presented as a hang. Both are fixed below.
// setup-dom matches the sibling CoverageDashboard.test.tsx.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
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

// JSDOM installs sessionStorage; this stub is the fallback if the environment
// ever changes, and loadMediaIndex caches through it either way.
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
function fakeGhServingCoverage(opts: {
  mediaOk: boolean;
  mediaShape?: "normal" | "rekeyed";
  /** slugs whose _meta.yml answers 403 rather than 404 */
  throttle?: string[];
}) {
  const meta = (slug: string) =>
    `component: "${slug}"\ndomains:\n  content: { status: approved }\n  usage: { status: not-started }\n  design: { status: not-started }\n  behavior: { status: not-started }\n  tokens: { status: not-started }\n`;
  const slugs = ["alpha", "beta"];
  const files: Record<string, string> = {
    "components/dist/registries/dskit.json": JSON.stringify({ components: {} }),
    "components/dist/media/_index.json": JSON.stringify(
      opts.mediaShape === "rekeyed"
        ? // A well-formed index under a DIFFERENT top-level key: loadIndex
          // resolves with {} for this, which used to read as "measured, and
          // nothing has a capture".
          { entries: { alpha: { default: "x.webp" } } }
        : { media: { alpha: { default: "components/dist/media/alpha/default.webp" } } },
    ),
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
        const throttled = (opts.throttle ?? []).some(
          (s) => path === `components/src/${s}/_meta.yml`,
        );
        if (throttled) {
          const e = new Error("forbidden") as Error & { status: number };
          e.status = 403;
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
  assert.equal(container.querySelector('[data-meter="component:capture"]') === null, true);
  assert.ok(container.querySelector('[data-meter="component:usage"]'));
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
    assert.ok(container.querySelector('[data-meter="component:capture"]'));
  });
  assert.ok(container.querySelector('[data-meter="component:usage"]'));
});

test("an index that parses but carries no media is unmeasurable, not empty", () => {
  // `loadIndex` returns `json.media ?? {}`, so it RESOLVES for a well-formed
  // index re-derived under another key. A resolved empty set would render
  // `Capture 0 of 73` across the whole registry — the lie with a number on it
  // that dropping the Slot exists to avoid.
  return (async () => {
    const { CoverageDashboard } = await import("../../src/app/CoverageDashboard");
    const { container } = mount(
      <CoverageDashboard
        octokit={fakeGhServingCoverage({ mediaOk: true, mediaShape: "rekeyed" })}
        onOpenFile={() => {}}
      />,
    );
    await waitFor(() => {
      assert.ok(container.querySelector('[data-meter="component:usage"]'));
    });
    assert.equal(
      container.querySelector('[data-meter="component:capture"]') === null,
      true,
      "a re-keyed index reported captures as measured-and-zero",
    );
  })();
});

test("a failed capture read says so, rather than silently dropping the Meter", () => {
  // Dropping the Slot without a word is the same omission the three-state
  // design says it exists to avoid: a reader who saw a Capture Meter yesterday
  // and not today cannot tell a measure that failed from one that was deleted.
  return (async () => {
    const { CoverageDashboard } = await import("../../src/app/CoverageDashboard");
    const { container } = mount(
      <CoverageDashboard
        octokit={fakeGhServingCoverage({ mediaOk: false })}
        onOpenFile={() => {}}
      />,
    );
    await waitFor(() => {
      assert.ok(container.querySelector('[data-meter="component:usage"]'));
    });
    assert.equal(
      container.querySelector('[data-meter="component:capture"]') === null,
      true,
    );
    assert.ok(
      (container.textContent ?? "").includes("not measured"),
      "the Capture Meter vanished with nothing said about why",
    );
  })();
});

test("a component whose _meta.yml cannot be READ is excluded, not counted as empty", () => {
  // coverageLoader.loadOne caught ANY failure and returned five blank domains,
  // so one 403 or rate limit reported a component as wholly unauthored and the
  // Meters rendered "Behavior 0 of N" with a measured date beside it. A 404 is
  // different: the directory exists and nobody has written _meta.yml, which
  // genuinely IS five empty domains.
  return (async () => {
    const { CoverageDashboard } = await import("../../src/app/CoverageDashboard");
    const { container } = mount(
      <CoverageDashboard
        octokit={fakeGhServingCoverage({ mediaOk: true, throttle: ["beta"] })}
        onOpenFile={() => {}}
      />,
    );
    await waitFor(() => {
      assert.ok(container.querySelector('[data-meter="component:content"]'));
    });
    const content = container.querySelector('[data-meter="component:content"]');
    assert.ok(content);
    // alpha read fine and is content-approved; beta was throttled and is out of
    // BOTH halves rather than dragging the denominator down as a false zero.
    assert.ok(
      (content.textContent ?? "").includes("1 of 1"),
      `throttled row counted as empty: "${content.textContent}"`,
    );
    assert.ok(
      (container.textContent ?? "").includes("could not be read"),
      "a row was dropped from the count with nothing said",
    );
    // Named, not just counted: a reader should not have to scan the table for
    // the row that is missing...
    assert.ok(
      (container.textContent ?? "").includes("beta"),
      "the unreadable slug is not named",
    );
    // ...and it is missing from the table too, rather than sitting there as
    // five clickable Empty cells. The loader excludes it once; the Meters and
    // the table read the same rows, so they cannot disagree about it.
    assert.equal(
      container.querySelectorAll("tbody tr").length,
      1,
      "the unreadable row was rendered as an empty component",
    );
  })();
});
