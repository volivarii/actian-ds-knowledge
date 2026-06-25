// tests/tokens-emit-css.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { emitCss } = require("../scripts/tokens/emit-css.js");

// ─── Minimal fullTree fixture ─────────────────────────────────────────────────

const fixture = {
  color: {
    annotation: {
      annotation: {
        $type: "color",
        $value: "#D71D6D",
        $extensions: {
          "com.actian.themes": { actian: "#D71D6D", studio: "#D71D6D", explorer: "#D71D6D" },
        },
      },
    },
    primary: {
      "500": {
        $type: "color",
        $value: "{color.primitive.royal-blue.500}",
        $extensions: {
          "com.actian.themes": { actian: "#0F5FDC", studio: "#0283BE", explorer: "#049B98" },
        },
      },
    },
    neutral: {
      "100": {
        $type: "color",
        $value: "#C7C7CE",
        $extensions: {
          "com.actian.themes": { actian: "#C7C7CE", studio: "#DADADA", explorer: "#DADADA" },
        },
      },
    },
    error: {
      "600": {
        $type: "color",
        $value: "#DC3514",
        $extensions: {
          "com.actian.themes": { actian: "#DC3514", studio: "#DC3514", explorer: "#DC3514" },
        },
      },
    },
  },
  border: {
    radius: {
      sm: { $type: "dimension", $value: "6px", $extensions: {} },
    },
    width: {
      md: { $type: "dimension", $value: "1px", $extensions: {} },
    },
    default: {
      $type: "color",
      $value: "#C7C7CE",
      $extensions: {
        "com.actian.status": "Shipped",
        "com.actian.border": { width: "1px", style: "solid", color: "{color.neutral.100}" },
      },
    },
    selected: {
      $type: "color",
      $value: "#0F5FDC",
      $extensions: {
        "com.actian.status": "Shipped",
        "com.actian.border": { width: "2px", style: "solid", color: "{color.primary.500}" },
      },
    },
    error: {
      $type: "color",
      $value: "#DC3514",
      $extensions: {
        "com.actian.status": "Shipped",
        "com.actian.border": { width: "1px", style: "solid", color: "{color.error.600}" },
      },
    },
  },
  "focus-ring": {
    offset: {
      $type: "dimension",
      $value: "2px",
      $extensions: { "com.actian.status": "Shipped" },
    },
    primary: {
      $type: "color",
      $value: "#0F5FDC",
      $extensions: {
        "com.actian.status": "Shipped",
        "com.actian.focusRing": { width: "2px", style: "solid", color: "{color.primary.500}" },
      },
    },
  },
  spacing: {
    xs: { $type: "dimension", $value: "8px", $extensions: {} },
  },
  size: {
    sm: { $type: "dimension", $value: "8px", $extensions: {} },
  },
  breakpoint: {
    md: { $type: "dimension", $value: "840px", $extensions: {} },
  },
  font: {
    family: {
      text: { $type: "fontFamily", $value: "Roboto", $extensions: {} },
    },
    weight: {
      regular: { $type: "fontWeight", $value: 400, $extensions: {} },
      semibold: { $type: "fontWeight", $value: 600, $extensions: {} },
    },
    size: {
      lg: { $type: "dimension", $value: "16px", $extensions: {} },
    },
    lineheight: {
      lg: { $type: "dimension", $value: "24px", $extensions: {} },
    },
    letterspacing: {
      normal: { $type: "dimension", $value: "0px", $extensions: {} },
      wide: {
        "1": { $type: "dimension", $value: "0.1px", $extensions: {} },
      },
    },
    "text-styles": {
      "heading-standard": {
        $type: "typography",
        $value: {
          fontWeight: "{font.weight.semibold}",
          fontSize: "{font.size.lg}",
          lineHeight: "{font.lineheight.lg}",
          letterSpacing: "{font.letterspacing.wide.1}",
        },
        $extensions: { "com.actian.status": "Shipped" },
      },
    },
  },
  icon: {
    sm: { $type: "dimension", $value: "16px", $extensions: {} },
  },
  shadow: {
    xs: {
      $type: "shadow",
      $value: "0px 1px 3px 1px rgba(0, 0, 15, 0.06), 0px 1px 5px 0px rgba(0, 0, 18, 0.07)",
      $extensions: { "com.actian.status": "Shipped" },
    },
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

test("emitCss - three theme selectors present", () => {
  const css = emitCss(fixture);
  assert.ok(css.includes(':root,\n[data-theme="actian"] {'), "actian selector");
  assert.ok(css.includes('[data-theme="studio"] {'), "studio selector");
  assert.ok(css.includes('[data-theme="explorer"] {'), "explorer selector");
});

test("emitCss - actian block has primary-500 hex", () => {
  const css = emitCss(fixture);
  // Actian block is everything before [data-theme="studio"]
  const actianBlock = css.split('[data-theme="studio"]')[0];
  assert.ok(
    actianBlock.includes("--zen-color-primary-500: #0f5fdc;"),
    "actian block must contain --zen-color-primary-500: #0f5fdc;"
  );
});

test("emitCss - studio block has primary-500 override", () => {
  const css = emitCss(fixture);
  const studioSection = css.split('[data-theme="studio"] {')[1].split("}")[0];
  assert.ok(
    studioSection.includes("--zen-color-primary-500: #0283be;"),
    "studio block must contain --zen-color-primary-500: #0283be;"
  );
});

test("emitCss - explorer omits var equal to actian (annotation)", () => {
  const css = emitCss(fixture);
  const explorerSection = css.split('[data-theme="explorer"] {')[1].split("}")[0];
  assert.ok(
    !explorerSection.includes("--zen-color-annotation-annotation"),
    "explorer must not emit annotation var when equal to actian"
  );
});

test("emitCss - heading-standard weight resolved from {font.weight.semibold}", () => {
  const css = emitCss(fixture);
  assert.ok(
    css.includes("--zen-font-heading-standard-weight: 600;"),
    "--zen-font-heading-standard-weight: 600;"
  );
});

test("emitCss - heading-standard size resolved from {font.size.lg}", () => {
  const css = emitCss(fixture);
  assert.ok(
    css.includes("--zen-font-heading-standard-size: 16px;"),
    "--zen-font-heading-standard-size: 16px;"
  );
});

test("emitCss - border-default present in actian block", () => {
  const css = emitCss(fixture);
  const actianBlock = css.split('[data-theme="studio"]')[0];
  assert.ok(
    actianBlock.includes("--zen-border-default:"),
    "--zen-border-default: must appear in actian block"
  );
});

test("emitCss - border-selected differs per theme (studio override)", () => {
  const css = emitCss(fixture);
  const studioSection = css.split('[data-theme="studio"] {')[1].split("}")[0];
  assert.ok(
    studioSection.includes("--zen-border-selected: #0283be;"),
    "studio must override --zen-border-selected"
  );
});

test("emitCss - shadow-xs multiline format", () => {
  const css = emitCss(fixture);
  assert.ok(
    css.includes("--zen-shadow-xs:\n    0px 1px 3px 1px rgba(0, 0, 15, 0.06)"),
    "--zen-shadow-xs must use multi-line format"
  );
});

test("emitCss - focus-ring-offset in actian block (not studio/explorer)", () => {
  const css = emitCss(fixture);
  const actianBlock = css.split('[data-theme="studio"]')[0];
  assert.ok(
    actianBlock.includes("--zen-focus-ring-offset: 2px;"),
    "--zen-focus-ring-offset must appear in actian block"
  );
  const studioSection = css.split('[data-theme="studio"] {')[1].split("}")[0];
  assert.ok(
    !studioSection.includes("--zen-focus-ring-offset"),
    "--zen-focus-ring-offset must not appear in studio block"
  );
});

test("emitCss - focus-ring-primary overrides in studio block", () => {
  const css = emitCss(fixture);
  const studioSection = css.split('[data-theme="studio"] {')[1].split("}")[0];
  assert.ok(
    studioSection.includes("--zen-focus-ring-primary: #0283be;"),
    "studio must override --zen-focus-ring-primary"
  );
});

test("emitCss - section comments in actian block", () => {
  const css = emitCss(fixture);
  const actianBlock = css.split('[data-theme="studio"]')[0];
  assert.ok(actianBlock.includes("/* ── Colors ── */"), "Colors comment");
  assert.ok(actianBlock.includes("/* ── Spacing ── */"), "Spacing comment");
  assert.ok(actianBlock.includes("/* ── Shadows ── */"), "Shadows comment");
});

test("emitCss - heading-standard line-height and letter-spacing resolved", () => {
  const css = emitCss(fixture);
  assert.ok(
    css.includes("--zen-font-heading-standard-line-height: 24px;"),
    "--zen-font-heading-standard-line-height: 24px;"
  );
  assert.ok(
    css.includes("--zen-font-heading-standard-letter-spacing: 0.1px;"),
    "--zen-font-heading-standard-letter-spacing: 0.1px;"
  );
});
