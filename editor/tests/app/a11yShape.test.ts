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

/**
 * Every JSX open tag `<Name ...>` for the given component, with its line.
 * The tag ends at the first `>` OUTSIDE braces and strings: cutting at the
 * first `>` of any kind let `onClick={() => x()} color="red"` read as a tag
 * with no colour, and a red callout with no alert role pass the guard.
 */
function openTags(source: string, name: string): { line: number; tag: string }[] {
  const out: { line: number; tag: string }[] = [];
  const re = new RegExp(`<${name.replace(".", "\\.")}(?=[\\s/>])`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let i = m.index;
    let depth = 0;
    let quote: string | null = null;
    for (; i < source.length; i++) {
      const c = source[i]!;
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) break;
    }
    out.push({ line: source.slice(0, m.index).split("\n").length, tag: source.slice(m.index, i + 1) });
  }
  return out;
}

/**
 * The local names under which a file imports Radix's Heading: `Heading`, or
 * whatever `Heading as X` renamed it to. Empty when the file does not import
 * it from `@radix-ui/themes` at all, so a `Heading` type from headingScan is
 * not mistaken for the component.
 */
function radixHeadingNames(source: string): string[] {
  const out: string[] = [];
  const re = /import\s*\{([^}]*)\}\s*from\s*"@radix-ui\/themes"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    for (const spec of m[1]!.split(",")) {
      const [imported, local] = spec.trim().split(/\s+as\s+/);
      if (imported?.trim() === "Heading") out.push((local ?? imported).trim());
    }
  }
  return out;
}

/** Like `offenders`, for a component whose local name each file decides. */
function offendersByImport(
  namesOf: (source: string) => string[],
  ok: (tag: string) => boolean,
): string[] {
  const out: string[] = [];
  for (const f of walk(SRC)) {
    const source = readFileSync(f, "utf8");
    for (const name of namesOf(source)) {
      for (const { line, tag } of openTags(source, name)) {
        if (!ok(tag)) out.push(`${relative(SRC, f)}:${line}`);
      }
    }
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
/**
 * A red Callout says what it IS to assistive technology: a failure that
 * interrupts (`role="alert"`), advisory text read politely (`role="status"`),
 * or standing content that is not live at all (`aria-live="off"`, the
 * explicit form, so a forgotten role and a deliberate one look different).
 * A callout whose colour is an expression may be red, so it declares too.
 */
const declaresLiveness = (tag: string) =>
  /\brole="(alert|status)"/.test(tag) || /\baria-live="off"/.test(tag);
const maySignal = (tag: string) =>
  /\bcolor="(red|amber)"/.test(tag) || /\bcolor=\{/.test(tag);

test("the matchers see what they are for (pattern self-test)", () => {
  // A guard that cannot fail is the failure mode this file exists to avoid.
  const src = [
    '<Heading size="3">',
    '<Heading as="h4" size="3">',
    '<Heading\n  as="h2"\n  size="5"\n>',
    "<HeadingLike />",
    '<Callout.Root color="red">',
    '<Callout.Root color="red" role="alert">',
    '<Callout.Root onClick={() => x()} color="red">',
    '<Callout.Root title="a > b" color="red" role="status">',
    '<Callout.Root color={tone}>',
    '<Callout.Root color="red" aria-live="off">',
    '<Callout.Root color="amber">',
  ].join("\n");
  const headings = openTags(src, "Heading");
  assert.equal(headings.length, 3, "HeadingLike must not match");
  // An aliased import is the same component under another name, and this
  // branch introduced one (`Heading as RadixHeading`, because a screen already
  // imports an outline type called Heading). The guard follows the import.
  const aliased = 'import { Box, Heading as RadixHeading } from "@radix-ui/themes";\n<RadixHeading size="2">x</RadixHeading>\n<Heading size="1">y</Heading>';
  assert.deepEqual(radixHeadingNames(aliased), ["RadixHeading"]);
  assert.deepEqual(
    radixHeadingNames('import { Heading } from "@radix-ui/themes";'),
    ["Heading"],
  );
  assert.equal(
    radixHeadingNames('import { Heading } from "../lib/headingScan";').length,
    0,
    "a Heading from elsewhere is not the Radix one",
  );
  assert.deepEqual(headings.map((h) => hasLevel(h.tag)), [false, true, true]);
  const callouts = openTags(src, "Callout.Root");
  assert.equal(callouts.length, 7);
  // The arrow function and the quoted `>` must not end the tag early.
  assert.ok(callouts[2]!.tag.endsWith('color="red">'), callouts[2]!.tag);
  assert.ok(callouts[3]!.tag.endsWith('role="status">'), callouts[3]!.tag);
  assert.deepEqual(
    callouts.map((c) => maySignal(c.tag)),
    [true, true, true, true, true, true, true],
  );
  assert.deepEqual(
    callouts.map((c) => declaresLiveness(c.tag)),
    [false, true, false, true, false, true, false],
  );
});

test("every Radix Heading in editor/src carries an explicit level", () => {
  const bad = offendersByImport(radixHeadingNames, hasLevel);
  assert.deepEqual(
    bad,
    [],
    `Heading without as= (defaults to h1):\n  ${bad.join("\n  ")}`,
  );
});

test("every Callout that may signal declares what it is to assistive technology", () => {
  // Red is a failure, amber is a warning, and a colour expression may be
  // either: a GitHub error rendered amber with no role was told to nobody
  // while a static tier notice rendered as an alert on every open.
  const bad = offenders("Callout.Root", (tag) => !maySignal(tag) || declaresLiveness(tag));
  assert.deepEqual(
    bad,
    [],
    `red, amber or dynamically coloured Callout without role="alert", role="status" or aria-live="off":\n  ${bad.join("\n  ")}`,
  );
});

test("the walk has a subject", () => {
  // An empty walk makes both guards above pass on nothing.
  assert.ok(walk(SRC).length > 40, `only ${walk(SRC).length} files walked`);
});
