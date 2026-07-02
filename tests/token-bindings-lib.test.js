const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const lib = require("../scripts/components/token-bindings-lib");

const TEXT = fs.readFileSync(
  __dirname + "/fixtures/card-for-perimeter.design-context.txt",
  "utf8",
);

test("parseDesignContext extracts own-node property->varName, skipping instance internals", () => {
  const parsed = lib.parseDesignContext(TEXT);
  // root own node
  assert.deepEqual(parsed["14783:7564"], {
    "background-color": "color-bg-default",
    padding: "spacing/spacing-sm",
    "border-radius": "border-radius-sm",
  });
  // instance-internal node (I…;…) must be absent
  assert.equal(parsed["I14783:7552;14007:23213"], undefined);
});

test("parseDesignContext captures directional padding (pb-/pl-/pr-) alongside pt-", () => {
  const text =
    '<div className="pb-[var(--spacing\\/spacing-sm,12px)] pl-[var(--spacing\\/spacing-sm,12px)] pr-[var(--spacing\\/spacing-sm,12px)]" data-node-id="1:1"></div>';
  const parsed = lib.parseDesignContext(text);
  assert.deepEqual(parsed["1:1"], {
    "padding-bottom": "spacing/spacing-sm",
    "padding-left": "spacing/spacing-sm",
    "padding-right": "spacing/spacing-sm",
  });
});

test("buildTokenNameSet + normalizeBinding grade against tokens.json", () => {
  const tokens = require("../tokens/tokens.json");
  const set = lib.buildTokenNameSet(tokens);
  assert.equal(set.has("color-bg-default"), true);
  assert.equal(set.has("spacing-sm"), true);
  // clean name
  assert.deepEqual(lib.normalizeBinding("color-bg-default", set), {
    token: "--zen-color-bg-default",
    grade: "semantic",
  });
  // collection-prefixed name: drop first segment matches
  assert.deepEqual(lib.normalizeBinding("spacing/spacing-sm", set), {
    token: "--zen-spacing-sm",
    grade: "semantic",
  });
  // primitive leak
  assert.deepEqual(lib.normalizeBinding("blue/50", set), {
    token: "--zen-blue-50",
    grade: "primitive",
  });
  // cross-domain guard: "text/size-sm" must NOT match the different-domain
  // "size-sm" token via a blind drop-first-segment fallback. The
  // drop-first-segment candidate is only accepted when it is a
  // repeated-prefix form (afterFirst === firstSeg or starts with
  // firstSeg + "-"). Here afterFirst="size-sm" does not start with "text-",
  // so the candidate is rejected and the full slug "text-size-sm" (not in
  // set) falls through to primitive.
  assert.deepEqual(lib.normalizeBinding("text/size-sm", set), {
    token: "--zen-text-size-sm",
    grade: "primitive",
  });
});

test("buildSidecar shapes byNodeId with graded bindings", () => {
  const set = lib.buildTokenNameSet(require("../tokens/tokens.json"));
  const parsed = {
    "14783:7564": {
      "background-color": "color-bg-default",
      padding: "spacing/spacing-sm",
    },
  };
  const doc = lib.buildSidecar(
    "card-for-perimeter",
    parsed,
    set,
    "2026-07-01T00:00:00Z",
  );
  assert.equal(doc.slug, "card-for-perimeter");
  assert.equal(doc._meta.auto_generated, true);
  assert.deepEqual(doc.byNodeId["14783:7564"], [
    {
      property: "background-color",
      token: "--zen-color-bg-default",
      grade: "semantic",
    },
    { property: "padding", token: "--zen-spacing-sm", grade: "semantic" },
  ]);
});

test("bindingGradeStats + renderCoverage tally per slug", () => {
  const stats = lib.bindingGradeStats({
    "card-for-perimeter": {
      byNodeId: { a: [{ grade: "semantic" }, { grade: "primitive" }] },
    },
  });
  assert.deepEqual(stats["card-for-perimeter"], {
    semantic: 1,
    primitive: 1,
    total: 2,
  });
  const md = lib.renderCoverage(stats);
  assert.match(md, /card-for-perimeter/);
  assert.match(
    md,
    /^# Token-binding coverage\n\n> AUTO-GENERATED — DO NOT EDIT\. Source: scripts\/components\/harvest-token-bindings\.js\n/,
  );
});

test("parseDesignContext captures border-width/border-color and height/width/size rules", () => {
  const text =
    '<div className="border-[length:var(--border-width-md,1px)] border-[var(--border-disabled,#c7c7ce)] h-[var(--lg,24px)] w-[var(--md,16px)]" data-node-id="2:1"></div>' +
    '<div className="size-[var(--sm,12px)]" data-node-id="2:2"></div>';
  const parsed = lib.parseDesignContext(text);
  assert.deepEqual(parsed["2:1"], {
    "border-width": "border-width-md",
    "border-color": "border-disabled",
    height: "lg",
    width: "md",
  });
  assert.deepEqual(parsed["2:2"], { height: "sm", width: "sm" });
});

const SET_SNIPPET = `
type TagStatusProps = {
  className?: string;
  status?: "Fail" | "Warning" | "Success";
};
export default function TagStatus({ className, status = "Fail" }: TagStatusProps) {
  const isFail = status === "Fail";
  const isSuccess = status === "Success";
  const isWarning = status === "Warning";
`;

test("parseSetMeta extracts declared values + destructure defaults", () => {
  const meta = lib.parseSetMeta(SET_SNIPPET);
  assert.deepEqual(meta.props.status, {
    values: ["Fail", "Warning", "Success"],
    default: "Fail",
  });
  assert.equal(meta.props.className, undefined); // not a quoted union
});

test("buildConstMap + resolveCondition handle isX, includes-lists, and unknowns", () => {
  const cm = lib.buildConstMap(SET_SNIPPET);
  assert.deepEqual(cm.isSuccess, { prop: "status", values: ["Success"] });
  assert.deepEqual(lib.resolveCondition("isWarning", cm), {
    prop: "status",
    values: ["Warning"],
  });
  assert.deepEqual(
    lib.resolveCondition('["Stopped", "Sleeping"].includes(status)', cm),
    {
      prop: "status",
      values: ["Stopped", "Sleeping"],
    },
  );
  assert.equal(lib.resolveCondition('type === "X" && state === "Y"', cm), null); // mixed: skip
});

test("splitTernary splits cond?value:chains with quoted and String.raw values", () => {
  const chain =
    'isSuccess ? String.raw`bg-[var(--success\\/25,#f0ffec)]` : isWarning ? "bg-[var(--color-bg-warning,#fff9e5)]" : String.raw`bg-[var(--error\\/25,#fff4ec)]`';
  const t = lib.splitTernary(chain);
  assert.equal(t.branches.length, 2);
  assert.equal(t.branches[0].cond, "isSuccess");
  assert.match(t.branches[0].value, /success/);
  assert.equal(t.branches[1].cond.trim(), "isWarning");
  assert.match(t.branches[1].value, /color-bg-warning/);
  assert.match(t.elseValue, /error/);
});

test("splitTernary: '?' inside quoted class strings does not split", () => {
  const chain = 'isA ? "content-[\'?\']" : "b"';
  const t = lib.splitTernary(chain);
  assert.equal(t.branches.length, 1);
  assert.match(t.branches[0].value, /\?/);
});

test("splitTemplate separates literal text from ${…} expression bodies", () => {
  const tpl = '${String.raw`base-a base-b `}${isX ? "c1" : "c2"} tail';
  const { literals, exprs } = lib.splitTemplate(tpl);
  assert.equal(exprs.length, 2);
  assert.match(exprs[0], /base-a/);
  assert.match(exprs[1], /isX/);
  assert.equal(literals.join(""), " tail");
});
