import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { FreshnessChip } from "../../src/app/FreshnessChip";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

function fakeGh(opts: { version?: string; commitDate?: string }) {
  return {
    repos: {
      getContent: async () => {
        if (opts.version === undefined) throw new Error("boom");
        return {
          data: {
            content: b64(JSON.stringify({ version: opts.version })),
            encoding: "base64",
          },
        };
      },
      listCommits: async () => {
        if (opts.commitDate === undefined) throw new Error("boom");
        return {
          data: [
            {
              author: { login: "actian-ds-bot" },
              commit: { author: { date: opts.commitDate } },
            },
          ],
        };
      },
    },
  } as any;
}

test("FreshnessChip renders version + relative update time", async () => {
  const recent = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  render(
    <Theme>
      <FreshnessChip
        octokit={fakeGh({ version: "0.34.83", commitDate: recent })}
      />
    </Theme>,
  );
  await waitFor(() => screen.getByText(/v0\.34\.83/));
  screen.getByText(/updated 3 h ago/);
});

test("FreshnessChip renders nothing when both probes fail", async () => {
  const { container } = render(
    <Theme>
      <FreshnessChip octokit={fakeGh({})} />
    </Theme>,
  );
  // Give the load a tick to settle, then assert silence.
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(container.querySelector(".rt-Badge"), null);
});

test("FreshnessChip shows version alone when the commit probe fails", async () => {
  render(
    <Theme>
      <FreshnessChip octokit={fakeGh({ version: "0.34.83" })} />
    </Theme>,
  );
  await waitFor(() => screen.getByText("v0.34.83"));
  assert.equal(screen.queryByText(/updated/), null);
});
