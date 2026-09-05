// The --zen-* namespace belongs to the design system.
//
// #580: `base.css` declared `--zen-color-text-link-default` and
// `--zen-color-text-link-visited` and then read them back. That family was
// RETIRED, so the names exist in no token set: the editor was inventing a name
// in someone else's namespace, and the two links it painted could not re-theme,
// because their values were pinned in the editor's own stylesheet rather than
// resolved from the token set. `dark-theme.css` did the same, plus a third,
// `--zen-color-text-link-reverse`, which it declared and never read.
//
// The distinction this guard has to hold, and the reason it checks EXISTENCE
// rather than value: `.md-prose` deliberately re-points eleven DS token names
// to a warm paper scale, and `dark-theme.css` re-points thirty-three to a dark
// one. Those are scoped overrides of things the design system publishes, and
// they are the editor's design, not a defect. Declaring a `--zen-*` name that
// the design system does NOT publish is a different act: it says the DS carries
// a token it does not.
//
// The editor's own colours have their own vocabulary, `--ed-*` (instrument.css).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES = join(HERE, "..", "..", "src", "styles");
const TOKENS_JSON = join(HERE, "..", "..", "..", "tokens", "tokens.json");

/** Every `--zen-*` name the design system publishes.
 *
 *  Read from `tokens/tokens.json`, the same source `scripts/build-tokens.mjs`
 *  emits the editor's `tokens.css` from, and NOT from that emitted file, which
 *  is gitignored and absent in a fresh checkout. A guard whose input is missing
 *  does not go red, it iterates nothing. */
function publishedNames(): Set<string> {
  const doc = JSON.parse(readFileSync(TOKENS_JSON, "utf8")) as unknown;
  const names = new Set<string>();
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  const walk = (node: unknown, path: string[]) => {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if ("$value" in obj) {
      names.add(`--zen-${path.map(sanitize).join("-")}`);
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("$") || k.startsWith("_")) continue;
      walk(v, [...path, k]);
    }
  };
  walk(doc, []);
  return names;
}

/** `--zen-*` names an editor stylesheet DECLARES, with the file and line. */
function declaredInEditor(): { file: string; line: number; name: string }[] {
  const out: { file: string; line: number; name: string }[] = [];
  for (const f of readdirSync(STYLES)) {
    // tokens.css is the generated copy of the token set itself, not the
    // editor's own CSS. It is also gitignored, so it may not be here at all.
    if (!f.endsWith(".css") || f === "tokens.css") continue;
    const text = readFileSync(join(STYLES, f), "utf8");
    text.split("\n").forEach((l, i) => {
      const t = l.trim();
      if (t.startsWith("*") || t.startsWith("/*")) return;
      const m = l.match(/(^|[^-\w])(--zen-[a-z0-9-]+)\s*:/);
      if (m) out.push({ file: f, line: i + 1, name: m[2]! });
    });
  }
  return out;
}

test("no editor stylesheet declares a --zen-* name the design system does not publish", () => {
  const published = publishedNames();
  // A stale reader does not go red, it makes the loop body never run.
  assert.ok(published.size >= 100, `token names read: ${published.size}`);
  const declared = declaredInEditor();
  assert.ok(declared.length >= 10, `--zen-* declarations found: ${declared.length}`);

  const invented = declared.filter((d) => !published.has(d.name));
  assert.deepEqual(
    invented.map((d) => `${d.file}:${d.line} ${d.name}`),
    [],
    "these names exist in no token set, so the editor is inventing them in the design system's namespace; " +
      "the editor's own colours belong to --ed-* (instrument.css)",
  );
});

test("both editor scales still override published token names", () => {
  // The other half, and it is checked PER FILE. Written first as one total
  // over every stylesheet, it stayed green with every override deleted from
  // base.css, because dark-theme.css's thirty-three carried the threshold on
  // their own: the paper scale could have vanished without a word. A guard
  // whose message names two things has to check both of them.
  const published = publishedNames();
  const declared = declaredInEditor().filter((d) => published.has(d.name));
  for (const [file, floor] of [
    ["base.css", 8],
    ["dark-theme.css", 20],
  ] as const) {
    const n = declared.filter((d) => d.file === file).length;
    assert.ok(
      n >= floor,
      `${file} overrides only ${n} published tokens (expected at least ${floor}); ` +
        "that scale is deliberate and its absence would make the guard above vacuous for this file",
    );
  }
});

test("every --zen-* an editor stylesheet READS resolves to something", () => {
  // The read side. `tests/styles/tokens-presence.test.ts` used to hold a
  // hand-written list of ten names base.css "depends on", checked by substring,
  // and one of them was `--zen-color-text-link-default`: a retired token the
  // list REQUIRED base.css to keep mentioning. A list is the wrong shape for
  // this. Every reference is the subject, not ten chosen ones.
  //
  // A name resolves if the design system publishes it, or if the same file
  // declares it (the paper and dark scales). Anything else paints whatever the
  // parent painted, silently.
  const published = publishedNames();
  const unresolved: string[] = [];
  let reads = 0;
  for (const f of readdirSync(STYLES)) {
    if (!f.endsWith(".css") || f === "tokens.css") continue;
    const text = readFileSync(join(STYLES, f), "utf8");
    const declared = new Set(
      [...text.matchAll(/(?:^|[^-\w])(--zen-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]!),
    );
    for (const m of text.matchAll(/var\((--zen-[a-z0-9-]+)/g)) {
      reads++;
      const name = m[1]!;
      if (!published.has(name) && !declared.has(name)) {
        unresolved.push(`${f} reads ${name}`);
      }
    }
  }
  assert.ok(reads >= 10, `--zen-* reads found: ${reads}`);
  assert.deepEqual(
    unresolved,
    [],
    "these resolve to nothing, so the element silently paints whatever its parent painted",
  );
});
