import test from "node:test";
import assert from "node:assert/strict";
import {
  toSkeletonOutline,
  countOutlineNodes,
} from "../../src/lib/recipeSkeleton";

// A capture's skeleton.content is the FRAME/TEXT/INSTANCE tree the plugin's
// render-node.js paints. This walker does NOT paint it: it reads the names off
// it so a reviewer can see the shape of the page a capture recorded. Every
// assertion below is about reading, and a walker that invents a name or throws
// on a shape the schema permits is worse than no outline at all.

const tree = [
  {
    type: "FRAME",
    name: "Quick view drawer",
    layout: { mode: "VERTICAL", spacing: 0 },
    sizing: { horizontal: 550, vertical: "FILL" },
    children: [
      {
        type: "FRAME",
        name: "Drawer header",
        children: [{ type: "TEXT", name: "Title", content: "Item title" }],
      },
      { type: "INSTANCE", name: "Tag row" },
    ],
  },
];

test("a nested skeleton keeps its nesting and its node names", () => {
  const outline = toSkeletonOutline(tree);
  assert.equal(outline.length, 1);
  const root = outline[0];
  assert.ok(root);
  assert.equal(root.name, "Quick view drawer");
  assert.equal(root.type, "FRAME");
  assert.deepEqual(
    root.children.map((c) => c.name),
    ["Drawer header", "Tag row"],
  );
  assert.equal(root.children[0]?.children[0]?.name, "Title");
});

test("a leaf node reports no children rather than undefined", () => {
  const tagRow = toSkeletonOutline(tree)[0]?.children[1];
  assert.ok(tagRow);
  assert.deepEqual(tagRow.children, []);
});

test("a TEXT node carries the words the capture recorded", () => {
  const outline = toSkeletonOutline(tree);
  assert.equal(outline[0]?.children[0]?.children[0]?.text, "Item title");
});

test("a node that declares sizing reports it as one readable pair", () => {
  const outline = toSkeletonOutline(tree);
  assert.equal(outline[0]?.size, "550 x FILL");
});

test("a node with no name reports null rather than inventing one", () => {
  // An unnamed frame is real in the captures. Naming it "Frame" here would put
  // a word on screen that is not in the substrate.
  const outline = toSkeletonOutline([{ type: "FRAME" }]);
  assert.equal(outline[0]?.name, null);
  assert.equal(outline[0]?.type, "FRAME");
});

test("a node with no type is still read, and says so", () => {
  const outline = toSkeletonOutline([{ name: "Mystery" }]);
  assert.equal(outline[0]?.type, "UNKNOWN");
  assert.equal(outline[0]?.name, "Mystery");
});

test("content that is not an array yields an empty outline, not a throw", () => {
  // A recipe predating the field, or one whose content is an object, must not
  // take the panel down: the reader is reviewing the recipe BECAUSE it may be
  // incomplete.
  assert.deepEqual(toSkeletonOutline(undefined), []);
  assert.deepEqual(toSkeletonOutline(null), []);
  assert.deepEqual(toSkeletonOutline({ type: "FRAME" }), []);
  assert.deepEqual(toSkeletonOutline("FRAME"), []);
});

test("a non-object entry inside the array is skipped, and its siblings survive", () => {
  const outline = toSkeletonOutline([
    null,
    "stray",
    { type: "FRAME", name: "Real" },
  ]);
  assert.equal(outline.length, 1);
  assert.equal(outline[0]?.name, "Real");
});

test("a children value that is not an array is read as no children", () => {
  const outline = toSkeletonOutline([
    { type: "FRAME", name: "Odd", children: "not a list" },
  ]);
  assert.deepEqual(outline[0]?.children, []);
});

test("sizing is reported only when the node declares it", () => {
  const outline = toSkeletonOutline([{ type: "FRAME", name: "Plain" }]);
  assert.equal(outline[0]?.size, null);
});

test("an outline reports how many nodes it holds, counting every depth", () => {
  // The panel collapses the skeleton by default, so the count is the only thing
  // a reader sees before deciding to expand it. Counting the top level only
  // would understate a real capture by an order of magnitude.
  assert.equal(countOutlineNodes(toSkeletonOutline(tree)), 4);
});

test("an empty outline counts zero rather than throwing", () => {
  assert.equal(countOutlineNodes([]), 0);
});

// An INSTANCE is where a capture touches the design system, and NONE of the 73
// instance nodes across the four recipes carries a `name`: they carry `ref`
// (the component) and usually `variant`. Reading only `name` renders all 73 as
// a bare repeated word, which is how this was missed until the panel was
// looked at rather than asserted about.

test("an INSTANCE names the component it instantiates", () => {
  const outline = toSkeletonOutline([
    { type: "INSTANCE", ref: "fmTag", variant: "Style=Light" },
  ]);
  assert.equal(outline[0]?.ref, "fmTag");
  assert.equal(outline[0]?.variant, "Style=Light");
});

test("an INSTANCE with no variant still names its component", () => {
  const outline = toSkeletonOutline([{ type: "INSTANCE", ref: "fmButton" }]);
  assert.equal(outline[0]?.ref, "fmButton");
  assert.equal(outline[0]?.variant, null);
});

test("a node that is not an instance carries no ref or variant", () => {
  const outline = toSkeletonOutline([{ type: "FRAME", name: "Header" }]);
  assert.equal(outline[0]?.ref, null);
  assert.equal(outline[0]?.variant, null);
});

// 49 of the 73 instance nodes carry `props`, and that is where the page's words
// live: `fmTabs {"Tabs": "General, Properties, People, Suggestions"}`. A TEXT
// node beside them keeps its string, so dropping props leaves those 49 rows
// mute for the same reason reading only `name` left all 73 mute.

test("an instance carries its props as ordered name-and-value pairs", () => {
  const outline = toSkeletonOutline([
    {
      type: "INSTANCE",
      ref: "fmTabs",
      props: { Tabs: "General, Properties", Active: "General" },
    },
  ]);
  assert.deepEqual(outline[0]?.props, [
    { name: "Tabs", value: "General, Properties" },
    { name: "Active", value: "General" },
  ]);
});

test("a node with no props reports an empty list, never undefined", () => {
  const outline = toSkeletonOutline([{ type: "FRAME", name: "Header" }]);
  assert.deepEqual(outline[0]?.props, []);
});

test("a non-string prop value is read rather than dropped", () => {
  // The schema does not constrain prop value types, and a mute row is the
  // failure this field exists to fix.
  const outline = toSkeletonOutline([
    { type: "INSTANCE", ref: "fmProgressBar", props: { Completion: 42 } },
  ]);
  assert.deepEqual(outline[0]?.props, [{ name: "Completion", value: "42" }]);
});

test("a props value that is not an object is read as no props", () => {
  const outline = toSkeletonOutline([
    { type: "INSTANCE", ref: "fmTag", props: "not an object" },
  ]);
  assert.deepEqual(outline[0]?.props, []);
});
