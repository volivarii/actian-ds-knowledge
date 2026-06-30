// tests/tokens-motion.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseMotion } = require("../scripts/tokens/lib/parse-motion.js");
const { deriveMotion } = require("../scripts/tokens/derive-tokens.js");

// ─── Inline fixtures ──────────────────────────────────────────────────────────

// §2.11 token rows (the real parseable rows — all have --zen-motion- prefix)
const DURATION_ROWS = [
  "| `--zen-motion-duration-instant` | `100ms` | Micro-feedback: button hovers | 🟡 Proposed |",
  "| `--zen-motion-duration-fast`    | `200ms` | Small scale: tooltip fade-ins | 🟡 Proposed |",
  "| `--zen-motion-duration-base`    | `300ms` | Structural changes            | 🟡 Proposed |",
  "| `--zen-motion-duration-slow`    | `400ms` | Large surfaces: modal scaling | 🟡 Proposed |",
];

const EASING_ROWS = [
  "| `--zen-motion-ease-entrance` | `ease-out`    | Fast start, slow finish. Objects entering the screen. | 🟡 Proposed |",
  "| `--zen-motion-ease-exit`     | `ease-in`     | Slow start, fast finish. Objects leaving the screen.  | 🟡 Proposed |",
  "| `--zen-motion-ease-standard` | `ease-in-out` | Smooth start and finish.                              | 🟡 Proposed |",
];

const DELAY_ROWS = [
  "| `--zen-motion-delay-stagger` | `20ms`  | Choreography: list item stagger | 🟡 Proposed |",
  "| `--zen-motion-delay-intent`  | `300ms` | Hover protection: tooltip delay | 🟡 Proposed |",
  "| `--zen-motion-delay-long`    | `500ms` | Feedback holding: auto-dismiss  | 🟡 Proposed |",
];

// Component Motion Guide rows — these use BARE names (no --zen-motion- prefix)
// and MUST be excluded by parseMotion.
const GUIDE_ROWS = [
  "| Open     | `duration-slow` | `ease-entrance` | Slides in from the right |",
  "| Close    | `duration-base` | `ease-exit`     | Slides out to the right  |",
  "| Expand   | `duration-base` | `ease-standard` | Height animates open     |",
  "| Collapse | `duration-base` | `ease-standard` | Height animates closed   |",
  "| Open     | `duration-base` | `ease-entrance` | Fades in over duration   |",
  "| Close    | `duration-fast` | `ease-standard` | Fades out over duration  |",
  "| Open     | `duration-slow` | `ease-entrance` | Modal scales in          |",
  "| Close    | `duration-fast` | `ease-exit`     | Modal scales out         |",
  "| Per-item duration  | Easing          | Delay per item   |",
  "| `duration-fast`    | `ease-entrance` | `delay-stagger` × item index |",
  "| Hover    | `duration-instant` | `ease-standard` | Background shift         |",
];

const FULL_MD = [
  ...DURATION_ROWS,
  ...EASING_ROWS,
  ...DELAY_ROWS,
  ...GUIDE_ROWS,
].join("\n");

// ─── parseMotion — counts ─────────────────────────────────────────────────────

test("parseMotion: emits 4 duration tokens", () => {
  const { duration } = parseMotion(FULL_MD);
  assert.equal(duration.length, 4, `expected 4 duration rows, got ${duration.length}`);
});

test("parseMotion: emits 3 easing tokens", () => {
  const { easing } = parseMotion(FULL_MD);
  assert.equal(easing.length, 3, `expected 3 easing rows, got ${easing.length}`);
});

test("parseMotion: emits 3 delay tokens", () => {
  const { delay } = parseMotion(FULL_MD);
  assert.equal(delay.length, 3, `expected 3 delay rows, got ${delay.length}`);
});

// ─── parseMotion — sample values ─────────────────────────────────────────────

test("parseMotion: duration-instant → name=instant value=100ms status=Proposed", () => {
  const { duration } = parseMotion(FULL_MD);
  const row = duration.find((r) => r.name === "instant");
  assert.ok(row, "instant row must exist");
  assert.equal(row.value, "100ms");
  assert.equal(row.status, "Proposed");
});

test("parseMotion: duration-slow → value=400ms", () => {
  const { duration } = parseMotion(FULL_MD);
  const row = duration.find((r) => r.name === "slow");
  assert.ok(row, "slow row must exist");
  assert.equal(row.value, "400ms");
});

test("parseMotion: easing entrance → name=entrance value=ease-out status=Proposed", () => {
  const { easing } = parseMotion(FULL_MD);
  const row = easing.find((r) => r.name === "entrance");
  assert.ok(row, "entrance row must exist");
  assert.equal(row.value, "ease-out");
  assert.equal(row.status, "Proposed");
});

test("parseMotion: easing exit → value=ease-in", () => {
  const { easing } = parseMotion(FULL_MD);
  const row = easing.find((r) => r.name === "exit");
  assert.ok(row, "exit row must exist");
  assert.equal(row.value, "ease-in");
});

test("parseMotion: easing standard → value=ease-in-out", () => {
  const { easing } = parseMotion(FULL_MD);
  const row = easing.find((r) => r.name === "standard");
  assert.ok(row, "standard row must exist");
  assert.equal(row.value, "ease-in-out");
});

test("parseMotion: delay stagger → name=stagger value=20ms status=Proposed", () => {
  const { delay } = parseMotion(FULL_MD);
  const row = delay.find((r) => r.name === "stagger");
  assert.ok(row, "stagger row must exist");
  assert.equal(row.value, "20ms");
  assert.equal(row.status, "Proposed");
});

test("parseMotion: delay long → value=500ms", () => {
  const { delay } = parseMotion(FULL_MD);
  const row = delay.find((r) => r.name === "long");
  assert.ok(row, "long row must exist");
  assert.equal(row.value, "500ms");
});

// ─── parseMotion — Component Motion Guide exclusion (CRITICAL scoping) ────────

test("parseMotion: Component Motion Guide rows are excluded (counts unchanged when GUIDE_ROWS included)", () => {
  // Full fixture includes 11 GUIDE_ROWS — counts must still be 4/3/3
  const { duration, easing, delay } = parseMotion(FULL_MD);
  assert.equal(duration.length, 4, "GUIDE rows must not bleed into duration");
  assert.equal(easing.length, 3, "GUIDE rows must not bleed into easing");
  assert.equal(delay.length, 3, "GUIDE rows must not bleed into delay");
});

test("parseMotion: GUIDE_ROWS-only markdown produces zero tokens in all families", () => {
  const guideOnly = GUIDE_ROWS.join("\n");
  const { duration, easing, delay } = parseMotion(guideOnly);
  assert.equal(duration.length, 0, "guide-only: no duration tokens");
  assert.equal(easing.length, 0, "guide-only: no easing tokens");
  assert.equal(delay.length, 0, "guide-only: no delay tokens");
});

// ─── deriveMotion — leaf shapes ───────────────────────────────────────────────

test("deriveMotion: returns motion.duration.<k> with $type=duration", () => {
  const tree = deriveMotion({ tokensMd: FULL_MD });
  assert.ok(tree.motion, "motion key must exist");
  assert.ok(tree.motion.duration, "motion.duration must exist");
  const leaf = tree.motion.duration.instant;
  assert.ok(leaf, "motion.duration.instant must exist");
  assert.equal(leaf.$type, "duration");
  assert.equal(leaf.$value, "100ms");
  assert.equal(leaf.$extensions["com.actian.status"], "Proposed");
});

test("deriveMotion: motion.duration.slow leaf", () => {
  const tree = deriveMotion({ tokensMd: FULL_MD });
  const leaf = tree.motion.duration.slow;
  assert.ok(leaf, "motion.duration.slow must exist");
  assert.equal(leaf.$type, "duration");
  assert.equal(leaf.$value, "400ms");
  assert.equal(leaf.$extensions["com.actian.status"], "Proposed");
});

test("deriveMotion: motion.ease.<k> uses $type=string (CSS keywords, not cubicBezier)", () => {
  const tree = deriveMotion({ tokensMd: FULL_MD });
  assert.ok(tree.motion.ease, "motion.ease must exist");
  const leaf = tree.motion.ease.entrance;
  assert.ok(leaf, "motion.ease.entrance must exist");
  // DTCG cubicBezier requires 4 numbers; CSS keywords are not numeric tuples.
  // Using $type:"string" to faithfully represent the CSS keyword value.
  assert.equal(leaf.$type, "string");
  assert.equal(leaf.$value, "ease-out");
  assert.equal(leaf.$extensions["com.actian.status"], "Proposed");
});

test("deriveMotion: motion.ease.standard → value=ease-in-out", () => {
  const tree = deriveMotion({ tokensMd: FULL_MD });
  const leaf = tree.motion.ease.standard;
  assert.ok(leaf, "motion.ease.standard must exist");
  assert.equal(leaf.$type, "string");
  assert.equal(leaf.$value, "ease-in-out");
});

test("deriveMotion: motion.delay.<k> uses $type=duration", () => {
  const tree = deriveMotion({ tokensMd: FULL_MD });
  assert.ok(tree.motion.delay, "motion.delay must exist");
  const leaf = tree.motion.delay.stagger;
  assert.ok(leaf, "motion.delay.stagger must exist");
  assert.equal(leaf.$type, "duration");
  assert.equal(leaf.$value, "20ms");
  assert.equal(leaf.$extensions["com.actian.status"], "Proposed");
});

test("deriveMotion: motion.delay.long → value=500ms", () => {
  const tree = deriveMotion({ tokensMd: FULL_MD });
  const leaf = tree.motion.delay.long;
  assert.ok(leaf, "motion.delay.long must exist");
  assert.equal(leaf.$type, "duration");
  assert.equal(leaf.$value, "500ms");
});

test("deriveMotion: all 4 durations present", () => {
  const tree = deriveMotion({ tokensMd: FULL_MD });
  for (const name of ["instant", "fast", "base", "slow"]) {
    assert.ok(tree.motion.duration[name], `motion.duration.${name} must exist`);
  }
});

test("deriveMotion: all 3 easings present", () => {
  const tree = deriveMotion({ tokensMd: FULL_MD });
  for (const name of ["entrance", "exit", "standard"]) {
    assert.ok(tree.motion.ease[name], `motion.ease.${name} must exist`);
  }
});

test("deriveMotion: all 3 delays present", () => {
  const tree = deriveMotion({ tokensMd: FULL_MD });
  for (const name of ["stagger", "intent", "long"]) {
    assert.ok(tree.motion.delay[name], `motion.delay.${name} must exist`);
  }
});
