// Regression for the dead-on-arrival wiring bug: a controller must install when
// its target node mounts BEHIND a loading gate (Spinner -> ready), not only at
// first commit. The old useEffect([]) + useRef captured a null ref (the root
// was still behind the gate) and never re-ran; a callback ref fires on attach.
import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { render, cleanup } from "@testing-library/react";
import React from "react";
import { useAttachController } from "../../src/lib/attachController";

function Harness(props: {
  ready: boolean;
  onInstall: (n: HTMLElement) => void;
  onTeardown: () => void;
}) {
  const attach = useAttachController((node) => {
    props.onInstall(node);
    return () => props.onTeardown();
  });
  return props.ready ? <div ref={attach} /> : <span>loading</span>;
}

test("installs when the target mounts behind a loading gate, and tears down on unmount", () => {
  const installs: HTMLElement[] = [];
  let teardowns = 0;
  const p = (ready: boolean) => (
    <Harness
      ready={ready}
      onInstall={(n) => installs.push(n)}
      onTeardown={() => teardowns++}
    />
  );

  const { rerender, unmount } = render(p(false));
  assert.equal(installs.length, 0, "no install while the gate shows loading");

  rerender(p(true));
  assert.equal(installs.length, 1, "installs once the real root mounts");
  assert.ok(installs[0] instanceof HTMLElement);

  unmount();
  assert.equal(teardowns, 1, "tears down on unmount");
  cleanup();
});

test("re-installs across a ready -> loading -> ready cycle (file switch), no leak", () => {
  const installs: HTMLElement[] = [];
  let teardowns = 0;
  const p = (ready: boolean) => (
    <Harness
      ready={ready}
      onInstall={(n) => installs.push(n)}
      onTeardown={() => teardowns++}
    />
  );

  const { rerender, unmount } = render(p(true));
  assert.equal(installs.length, 1, "installed on the first ready root");

  rerender(p(false)); // file switch flips back to the loading gate
  assert.equal(teardowns, 1, "torn down when the root detaches");

  rerender(p(true)); // the new file's root mounts
  assert.equal(installs.length, 2, "re-installed on the new root");

  unmount();
  assert.equal(teardowns, 2, "final teardown on unmount, no double/none");
  cleanup();
});
