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
  assert.deepEqual(parsed.nodes["14783:7564"], [
    { property: "background-color", varName: "color-bg-default" },
    { property: "padding", varName: "spacing/spacing-sm" },
    { property: "border-radius", varName: "border-radius-sm" },
  ]);
  assert.equal(parsed.nodes["I14783:7552;14007:23213"], undefined);
  assert.equal(parsed.root, null); // non-set capture
  assert.deepEqual(parsed.variantDefaults, {});
});

test("parseDesignContext captures directional padding (pb-/pl-/pr-) alongside pt-", () => {
  const text =
    '<div className="pb-[var(--spacing\\/spacing-sm,12px)] pl-[var(--spacing\\/spacing-sm,12px)] pr-[var(--spacing\\/spacing-sm,12px)]" data-node-id="1:1"></div>';
  const parsed = lib.parseDesignContext(text);
  assert.deepEqual(parsed.nodes["1:1"].map((e) => e.property).sort(), [
    "padding-bottom",
    "padding-left",
    "padding-right",
  ]);
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

test("buildSidecar shapes byNodeId with graded, deterministically ordered bindings", () => {
  const set = lib.buildTokenNameSet(require("../tokens/tokens.json"));
  const nodes = {
    "7370:4928": [
      {
        property: "background-color",
        varName: "success/25",
        variant: { prop: "Status", values: ["Success"] },
      },
      {
        property: "background-color",
        varName: "error/25",
        variant: { prop: "Status", values: ["Fail"] },
      },
      {
        property: "background-color",
        varName: "color-bg-warning",
        variant: { prop: "Status", values: ["Warning"] },
      },
      { property: "border-radius", varName: "border-radius-xs" },
    ],
  };
  const doc = lib.buildSidecar(
    "tag-status",
    nodes,
    set,
    "2026-07-02T00:00:00Z",
    { Status: "Fail" },
  );
  assert.equal(doc.slug, "tag-status");
  assert.deepEqual(doc.variantDefaults, { Status: "Fail" });
  const bgs = doc.byNodeId["7370:4928"].filter(
    (b) => b.property === "background-color",
  );
  // Defensive ordering: non-default scoped first (token asc), DEFAULT-scoped LAST
  assert.deepEqual(
    bgs.map((b) => b.token),
    ["--zen-color-bg-warning", "--zen-success-25", "--zen-error-25"],
  );
  assert.deepEqual(bgs[2].variant, { prop: "Status", values: ["Fail"] });
  assert.equal(bgs[0].grade, "semantic");
  assert.equal(bgs[1].grade, "primitive");
});

test("buildSidecar omits variantDefaults when empty and keeps v1 output for unscoped nodes", () => {
  const set = lib.buildTokenNameSet(require("../tokens/tokens.json"));
  const nodes = {
    "14783:7564": [
      { property: "background-color", varName: "color-bg-default" },
      { property: "padding", varName: "spacing/spacing-sm" },
    ],
  };
  const doc = lib.buildSidecar(
    "card-for-perimeter",
    nodes,
    set,
    "2026-07-01T00:00:00Z",
    {},
  );
  assert.equal("variantDefaults" in doc, false);
  assert.deepEqual(doc.byNodeId["14783:7564"], [
    {
      property: "background-color",
      token: "--zen-color-bg-default",
      grade: "semantic",
    },
    { property: "padding", token: "--zen-spacing-sm", grade: "semantic" },
  ]);
});

test("bindingGradeStats + renderCoverage tally per slug incl. scoped", () => {
  const stats = lib.bindingGradeStats({
    "tag-status": {
      byNodeId: {
        a: [
          { grade: "semantic" },
          {
            grade: "primitive",
            variant: { prop: "Status", values: ["Success"] },
          },
        ],
      },
    },
  });
  assert.deepEqual(stats["tag-status"], {
    semantic: 1,
    primitive: 1,
    scoped: 1,
    total: 2,
  });
  const md = lib.renderCoverage(stats);
  assert.match(
    md,
    /\| Component \| Semantic \| Primitive \| Scoped \| Total \|/,
  );
  assert.match(md, /\| tag-status \| 1\/2 \| 1 \| 1 \| 2 \|/);
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
  const byProp = Object.fromEntries(
    parsed.nodes["2:1"].map((e) => [e.property, e.varName]),
  );
  assert.deepEqual(byProp, {
    "border-width": "border-width-md",
    "border-color": "border-disabled",
    height: "lg",
    width: "md",
  });
  assert.deepEqual(parsed.nodes["2:2"].map((e) => e.property).sort(), [
    "height",
    "width",
  ]);
});

const SET_TEXT = `
type TagXProps = {
  className?: string;
  status?: "Fail" | "Warning" | "Success" | "Stopped" | "Sleeping";
};
export default function TagX({ className, status = "Fail" }: TagXProps) {
  const isFail = status === "Fail";
  const isSuccess = status === "Success";
  const isWarning = status === "Warning";
  return (
    <div className={className || \`\${String.raw\`gap-[var(--spacing\\/spacing-2xs,4px)] h-[var(--lg,24px)] \`}\${["Stopped", "Sleeping"].includes(status) ? "bg-[var(--color-bg-sunken,#e1e1e6)]" : isSuccess ? String.raw\`bg-[var(--success\\/25,#f0ffec)]\` : isWarning ? "bg-[var(--color-bg-warning,#fff9e5)]" : String.raw\`bg-[var(--error\\/25,#fff4ec)]\`}\`} id={isSuccess ? "node-7370_4927" : isWarning ? "node-7370_4929" : "node-7370_4928"}>
      <p className="text-[color:var(--color-text-tertiary,#50505d)]" data-node-id="7314:4575">x</p>
    </div>
  );
}`;

test("parseDesignContext v2 parses a set root: ids, base + scoped bindings, defaults", () => {
  const parsed = lib.parseDesignContext(SET_TEXT);
  // root ternary ids, underscore->colon
  assert.deepEqual(parsed.root.ids.sort(), [
    "7370:4927",
    "7370:4928",
    "7370:4929",
  ]);
  // base (unscoped) facts
  const unscoped = parsed.root.bindings.filter((b) => !b.variant);
  assert.deepEqual(unscoped.map((b) => b.property).sort(), ["gap", "height"]);
  // scoped facts, incl. includes-list scope and else-branch inference
  const bg = parsed.root.bindings.filter(
    (b) => b.property === "background-color",
  );
  const byToken = Object.fromEntries(bg.map((b) => [b.varName, b.variant]));
  assert.deepEqual(byToken["color-bg-sunken"], {
    prop: "status",
    values: ["Stopped", "Sleeping"],
  });
  assert.deepEqual(byToken["success/25"], {
    prop: "status",
    values: ["Success"],
  });
  assert.deepEqual(byToken["color-bg-warning"], {
    prop: "status",
    values: ["Warning"],
  });
  // else branch = declared minus covered = Fail
  assert.deepEqual(byToken["error/25"], { prop: "status", values: ["Fail"] });
  // defaults only for referenced props
  assert.deepEqual(parsed.variantDefaults, { status: "Fail" });
  // child element still parses as a plain node
  assert.deepEqual(parsed.nodes["7314:4575"], [
    { property: "color", varName: "color-text-tertiary" },
  ]);
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
