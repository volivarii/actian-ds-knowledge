"use strict";
// One word per thing. app-context/src/terminology.yml names the product's word
// for each thing (`use`) and the words it never uses for it (`notUse`). This
// holds the product-facing text of the knowledge to that list: the labels and
// values a screen shows in the app records, entities, recipes and rendered
// fragments. Code identifiers and prose about the rule are out of scope, and a
// forbidden word only counts as a whole word ("record" is caught, "recorded"
// and `record_id` are not).
//
// Reads app-context/dist and components/render/dist: run `npm run
// derive:app-context && npm run derive:render` first after editing a source.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const ROOT = path.resolve(__dirname, "..");
const terms = YAML.parse(
  fs.readFileSync(path.join(ROOT, "app-context/src/terminology.yml"), "utf8"),
).terms;

const escapeRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A word and its plural as one pattern: entry/entries, search/searches,
// analysis/analyses, record/records. Words of a phrase are joined by any run of
// whitespace, a no-break space included.
function wordForm(w) {
  const words = w.trim().split(/\s+/).map(escapeRe);
  const last = words.pop();
  let plural;
  if (/[^aeiou]y$/i.test(last)) plural = last.slice(0, -1) + "(?:y|ies)";
  else if (/is$/i.test(last)) plural = last.slice(0, -2) + "(?:is|es)";
  else if (/(?:s|x|z|ch|sh)$/i.test(last)) plural = last + "(?:es)?";
  else plural = last + "s?";
  return words.concat(plural).join("[\\s\\u00a0]+");
}
function banned() {
  const out = [];
  for (const [slug, t] of Object.entries(terms)) {
    for (const w of t.notUse || []) {
      out.push({
        slug,
        w,
        re: new RegExp(
          "(^|[^A-Za-z0-9_-])" + wordForm(w) + "(?![A-Za-z0-9_-])",
          "i",
        ),
      });
    }
  }
  return out;
}

// Product-facing text only: labels and values a screen shows. An enum's
// `states` and an `example` are values a screen shows too, and so is a
// section's text node (`content`). Keys compare case-insensitively (a
// component prop is `Title`, `Placeholder`), and every string under a
// component's `props` is text it draws ("Featured property 2").
const TEXT_KEYS = ["label", "title", "text", "placeholder", "name", "value", "example", "content"];
const LIST_KEYS = ["states"];
function productText() {
  const texts = [];
  const push = (where, s) => {
    if (typeof s === "string") texts.push({ where, s });
  };
  const walk = (where, v) => {
    if (Array.isArray(v)) v.forEach((x) => walk(where, x));
    else if (v && typeof v === "object")
      Object.entries(v).forEach(([k, x]) => {
        const key = k.toLowerCase();
        if (TEXT_KEYS.includes(key)) push(where + "." + k, x);
        if (LIST_KEYS.includes(key) && Array.isArray(x)) x.forEach((s) => push(where + "." + k, s));
        if (key === "props" && x && typeof x === "object" && !Array.isArray(x))
          Object.entries(x).forEach(([pk, px]) => {
            if (!TEXT_KEYS.includes(pk.toLowerCase())) push(where + ".props." + pk, px);
          });
        walk(where + "." + k, x);
      });
  };
  const ac = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "app-context/dist/app-context.json"),
      "utf8",
    ),
  );
  walk("apps", ac.apps);
  walk("entities", ac.entities);
  walk("patterns", ac.patterns);
  walk("personas", ac.personas);
  // An entity property may be a bare field name ("curator"), which is a label
  // a screen shows as much as a { name } descriptor is.
  for (const [slug, e] of Object.entries(ac.entities)) {
    for (const p of e.properties || [])
      if (typeof p === "string") push("entities." + slug + ".properties", p);
  }
  // The recipes, and the sections they reference by slug: a recipe carries a
  // section as { type: SECTION, section: <slug> }, so its text is only read
  // here.
  for (const dir of ["recipes", "sections"]) {
    const d = path.join(ROOT, "app-context/src", dir);
    for (const f of fs.readdirSync(d).filter((f) => f.endsWith(".json"))) {
      walk(dir + "/" + f, JSON.parse(fs.readFileSync(path.join(d, f), "utf8")));
    }
  }
  const fr = path.join(ROOT, "components/render/dist/fragments");
  for (const f of fs.readdirSync(fr).filter((f) => f.endsWith(".html"))) {
    const html = fs
      .readFileSync(path.join(fr, f), "utf8")
      .replace(/<script[\s\S]*?<\/script>/g, " ");
    // Attribute text a reader meets (placeholders, accessible names, titles,
    // alt text), then the text between tags with whitespace collapsed, so a
    // phrase split by a tag still reads as one.
    for (const m of html.matchAll(/\b(?:placeholder|aria-label|title|alt)="([^"]*)"/g)) push("fragments/" + f + " (attribute)", m[1]);
    push("fragments/" + f, html.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " "));
  }
  return texts;
}

// No term's own word contains a word any term forbids ("Input Port" once
// tripped its own `input`): the enforcement would then flag the product's word.
test("no term's own word contains a forbidden word", () => {
  const clashes = [];
  for (const [slug, t] of Object.entries(terms)) {
    for (const b of banned()) if (b.re.test(String(t.use))) clashes.push(slug + ": " + t.use + " has " + b.w + " (" + b.slug + ")");
  }
  assert.deepEqual(clashes, []);
});

test("the check catches a planted word and ignores longer words and identifiers", () => {
  const b = banned().find((x) => x.w === "record");
  assert.ok(b, "record should stay forbidden");
  assert.ok(b.re.test("Edit the record"));
  assert.ok(!b.re.test("recorded yesterday") && !b.re.test("record_id"));
});

// A plural is the same word: "No entries found" uses `entry`, "saved
// searches" uses `saved search`. A phrase split by two spaces is one phrase.
test("the check catches plurals and a phrase whatever its spacing", () => {
  const re = (w) => banned().find((x) => x.w === w).re;
  assert.ok(re("entry").test("No entries found"), "entries");
  assert.ok(re("entry").test("One entry"), "entry");
  assert.ok(re("last modified").test("Last  modified: today"), "double space");
  assert.ok(re("last modified").test("Last\u00a0modified"), "no-break space");
});

// The walk reaches what a recipe screen shows: a section's text nodes
// (`content`), a component's capitalised props ("Featured property 2") and
// the sections the recipes only reference by slug.
test("the scan reads section text, recipe props and capitalised keys", () => {
  const all = productText();
  const has = (where, s) => all.some((x) => x.where.startsWith(where) && x.s === s);
  assert.ok(has("sections/item-header.json", "Last updated: {{last_updated}}"), "section content");
  assert.ok(all.some((x) => x.where.startsWith("recipes/faceted-browse.json") && x.where.endsWith(".props.Last updated") && x.s === "Jul 6, 2026"), "recipe prop");
  assert.ok(has("recipes/faceted-browse.json", "COUNT BY ORDER STATUS"), "capitalised Title");
});

test("no product-facing text uses a notUse word", () => {
  const hits = [];
  const list = banned();
  for (const { where, s } of productText()) {
    for (const b of list) {
      const m = b.re.exec(s);
      if (m)
        hits.push(
          where +
            ": " +
            JSON.stringify(
              s.slice(Math.max(0, m.index - 20), m.index + 30).trim(),
            ) +
            " has " +
            b.w +
            " (use " +
            terms[b.slug].use +
            ")",
        );
    }
  }
  assert.deepEqual(hits, []);
});
