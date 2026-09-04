// Two tree-wide guards on the shape of the source, because both defects
// recurred across files and a fix in the file where each was last seen is how
// a shape comes back.
//
// 1. Every Radix `Heading` carries an explicit level. The default is h1, so a
//    `<Heading size="2">` is a page-level heading in size-2 clothing: the
//    deployed Home page carried NINE h1s (#653), eight of them the app title
//    and the sidebar section labels, while a component test asserting "one h1"
//    stayed green because it mounted the screen without the shell.
// 2. Every red Callout is an alert. Red means "this failed" in this codebase,
//    and a failure announced to nobody is the F20 finding.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "generated") continue;
      walk(p, out);
    } else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Every JSX open tag `<Name ...>` for the given component, with its line. */
function openTags(source: string, name: string): { line: number; tag: string }[] {
  const out: { line: number; tag: string }[] = [];
  const re = new RegExp(`<${name.replace(".", "\\.")}(?=[\\s/>])`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const end = source.indexOf(">", m.index);
    const tag = source.slice(m.index, end === -1 ? undefined : end + 1);
    out.push({ line: source.slice(0, m.index).split("\n").length, tag });
  }
  return out;
}

function offenders(name: string, ok: (tag: string) => boolean): string[] {
  const out: string[] = [];
  for (const f of walk(SRC)) {
    for (const { line, tag } of openTags(readFileSync(f, "utf8"), name)) {
      if (!ok(tag)) out.push(`${relative(SRC, f)}:${line}`);
    }
  }
  return out;
}

const hasLevel = (tag: string) => /\bas=["{]/.test(tag);
const isAlert = (tag: string) => /\brole="alert"/.test(tag);

test("the matchers see what they are for (pattern self-test)", () => {
  // A guard that cannot fail is the failure mode this file exists to avoid.
  const src = [
    '<Heading size="3">',
    '<Heading as="h4" size="3">',
    '<Heading\n  as="h2"\n  size="5"\n>',
    "<HeadingLike />",
    '<Callout.Root color="red">',
    '<Callout.Root color="red" role="alert">',
  ].join("\n");
  const headings = openTags(src, "Heading");
  assert.equal(headings.length, 3, "HeadingLike must not match");
  assert.deepEqual(headings.map((h) => hasLevel(h.tag)), [false, true, true]);
  const callouts = openTags(src, "Callout.Root");
  assert.deepEqual(callouts.map((c) => isAlert(c.tag)), [false, true]);
});

test("every Radix Heading in editor/src carries an explicit level", () => {
  const bad = offenders("Heading", hasLevel);
  assert.deepEqual(
    bad,
    [],
    `Heading without as= (defaults to h1):\n  ${bad.join("\n  ")}`,
  );
});

test("every red Callout in editor/src is an alert", () => {
  const bad = offenders("Callout.Root", (tag) =>
    !/color="red"/.test(tag) || isAlert(tag),
  );
  assert.deepEqual(bad, [], `red Callout without role="alert":\n  ${bad.join("\n  ")}`);
});
