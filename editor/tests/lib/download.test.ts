// The export hands the reader a file. Three careless mistakes it must not make.
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { downloadCsv, downloadText } from "../../src/lib/download";
import { measuredToday } from "../../src/lib/measure";

interface Captured {
  href: string;
  download: string;
}

function withStubbedObjectUrl<T>(run: (state: {
  created: number;
  revoked: string[];
  clicks: Captured[];
}) => T): T {
  const state = { created: 0, revoked: [] as string[], clicks: [] as Captured[] };
  const url = globalThis.URL as unknown as {
    createObjectURL?: (b: Blob) => string;
    revokeObjectURL?: (u: string) => void;
  };
  const priorCreate = url.createObjectURL;
  const priorRevoke = url.revokeObjectURL;
  const priorClick = HTMLAnchorElement.prototype.click;
  url.createObjectURL = () => {
    state.created += 1;
    return `blob:stub/${state.created}`;
  };
  url.revokeObjectURL = (u: string) => {
    state.revoked.push(u);
  };
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    state.clicks.push({ href: this.href, download: this.download });
  };
  try {
    return run(state);
  } finally {
    url.createObjectURL = priorCreate;
    url.revokeObjectURL = priorRevoke;
    HTMLAnchorElement.prototype.click = priorClick;
  }
}

afterEach(() => {
  document.body.innerHTML = "";
});

test("the filename carries the same date stamp the screen shows", () => {
  // Two exports taken a month apart are otherwise indistinguishable in a
  // downloads folder.
  withStubbedObjectUrl((state) => {
    downloadCsv("a,b\n", "component-coverage");
    assert.equal(state.clicks.length, 1);
    assert.equal(
      state.clicks[0]?.download,
      `component-coverage-${measuredToday()}.csv`,
    );
  });
});

test("the object URL is revoked and the anchor is removed", () => {
  withStubbedObjectUrl((state) => {
    downloadCsv("a,b\n", "component-coverage");
    assert.equal(state.revoked.length, 1, "the blob stays in memory for the tab's life");
    assert.equal(state.revoked[0], state.clicks[0]?.href);
    assert.equal(
      document.querySelectorAll("a[download]").length,
      0,
      "a stray anchor was left in the document",
    );
  });
});

test("a click that throws still cleans up", () => {
  // The cleanup is in a finally for this reason. Without it a failed download
  // leaks the blob AND leaves the anchor behind.
  const priorClick = HTMLAnchorElement.prototype.click;
  const revoked: string[] = [];
  const url = globalThis.URL as unknown as {
    createObjectURL?: (b: Blob) => string;
    revokeObjectURL?: (u: string) => void;
  };
  const priorCreate = url.createObjectURL;
  const priorRevoke = url.revokeObjectURL;
  url.createObjectURL = () => "blob:stub/throw";
  url.revokeObjectURL = (u: string) => revoked.push(u);
  HTMLAnchorElement.prototype.click = () => {
    throw new Error("blocked");
  };
  try {
    assert.throws(() => downloadText("x", "stem", "csv", "text/csv"));
    assert.deepEqual(revoked, ["blob:stub/throw"]);
    assert.equal(document.querySelectorAll("a[download]").length, 0);
  } finally {
    HTMLAnchorElement.prototype.click = priorClick;
    url.createObjectURL = priorCreate;
    url.revokeObjectURL = priorRevoke;
  }
});
