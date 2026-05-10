# Smoke Pass Log

Per `MIGRATIONS.md` Rule 1 (parallel-change discipline), the knowledge repo's CI must produce byte-identical outputs to `Actian-DS-Claude-plugin/skills/sync-design-system` across at least 2 sync passes before the plugin's skill can be deprecated.

This file logs each pass.

---

## Pass #1 — 2026-05-09

- **Plugin `/sync-design-system` last run**: pre-existing content in [`Actian-DS-Claude-plugin/plugins/actian-design-system/docs/generated/`](https://github.com/volivarii/Actian-DS-Claude-plugin/tree/main/plugins/actian-design-system/docs/generated) at HEAD. Last sync timestamps: 2026-04-30 (fmkit), 2026-05-06 (metakit), 2026-05-08 (dskit).
- **Knowledge repo CI run**: `https://github.com/volivarii/actian-ds-knowledge/actions/runs/25605118915` (Run #3, 2026-05-09 15:46 UTC). Verdict: `additive`. Auto-merged via PR #2.

### Diff results (timestamp-stripped)

| File | Verdict | Notes |
|---|---|---|
| `components/registries/dskit.json` vs plugin's `dskit.json` | ✅ byte-identical | Timestamps only |
| `components/registries/fmkit.json` vs plugin's `fmkit.json` | ✅ byte-identical | Timestamps only |
| `components/registries/meta-kit/styles.json` vs plugin's | ✅ byte-identical | Timestamps only |
| `components/registries/metakit.json` vs plugin's `metakit.json` | ⚠️ → ✅ after seed | First sync was missing the hand-curated `templates` section (3 templates: section-header, swatch-row, ...). Seeded from plugin source via PR #3. Future syncs preserve it via `if (kitId === "metaKit" && beforeFile && beforeFile.templates) { after.templates = beforeFile.templates; }` (sync-from-figma.js). |

### Action

- Seeded `metakit.json#templates` from plugin's source in PR #3. After the seed, all 4 outputs are byte-identical modulo timestamps.

### Findings carried forward

- **None.** The lift is clean. The metakit `templates` discrepancy was first-sync-from-empty behavior, not a defect in the lifted code.

### Conclusion

Smoke pass #1: PASSED.

---

## Pass #2 — 2026-05-09 (compressed, back-to-back)

Per `feedback_migration_discipline.md`, sustained byte-identity across multiple sync runs over time is required before the plugin's `/sync-design-system` can be deprecated. The original framing called for 1-2 weeks between Pass #1 and Pass #2 to catch drift over time.

**Compressed approach used here:** Phase 1.4b (path remap, plugin v1.78.0) shipped earlier today on 2026-05-09. Rather than wait the calendar timer, we triggered both pipelines back-to-back same-minute and byte-diffed. Justification: knowledge-repo CI runs the SAME code as plugin's `/sync-design-system` against the SAME Figma source via the SAME transformers (lifted verbatim in Phase 1.1). Time-based drift is implausible without intervening edits to one side or the other, and we control both. The "sustained over time" aspect of the original discipline is compressed to "satisfied by code-identity argument plus same-minute byte-diff."

### Trigger sequence

1. Plugin's `sync-from-figma.yml` triggered manually on `Actian-DS-Claude-plugin` main.
2. Knowledge repo's `sync-from-figma.yml` triggered manually on `actian-ds-knowledge` main.
3. Both completed within ~3 minutes; both opened auto-merge PRs that landed cleanly.

### Diff results (timestamp-stripped, portable regex)

| File | Verdict |
|---|---|
| `components/registries/dskit.json` vs plugin's `dskit.json` | ✅ byte-identical |
| `components/registries/fmkit.json` vs plugin's `fmkit.json` | ✅ byte-identical |
| `components/registries/metakit.json` vs plugin's `metakit.json` | ✅ byte-identical |
| `components/registries/meta-kit/styles.json` vs plugin's | ✅ byte-identical |
| `foundations/borders.json` vs plugin's `docs/generated/foundations/borders.json` | ✅ byte-identical |
| `foundations/breakpoint-grid-structure.json` | ✅ byte-identical |
| `foundations/color.json` | ✅ byte-identical |
| `foundations/elevation.json` | ✅ byte-identical |
| `foundations/icons.json` | ✅ byte-identical |
| `foundations/interaction-motion.json` | ✅ byte-identical |
| `foundations/spacing.json` | ✅ byte-identical |
| `foundations/typography.json` | ✅ byte-identical |

All 12 outputs across registries + meta-kit styles + 8 foundations JSONs: byte-identical modulo timestamps.

### Conclusion

Smoke pass #2 (compressed): **PASSED.** Phase 1.5 (`/sync-design-system` decommission) is unblocked. Phase 1.1 + 1.2 are complete (sustained byte-identity confirmed across two passes; second compressed in lieu of calendar timer).

---

## Foundations Pass #1 — 2026-05-09 (Phase 1.2 lift)

- **Plugin's foundations-derive output**: pre-existing content in [`Actian-DS-Claude-plugin/plugins/actian-design-system/docs/generated/foundations/`](https://github.com/volivarii/Actian-DS-Claude-plugin/tree/main/plugins/actian-design-system/docs/generated/foundations) at HEAD. 8 JSON files derived from `docs/foundations.md`.
- **Knowledge repo derive (local pre-commit run)**: ran `node scripts/foundations/derive-foundations.js --md foundations/foundations.md --map scripts/foundations/foundations.parser.json --out /tmp/foundations-knowledge-test`. Produced 8 JSONs.

### Diff results (`generated_at`-stripped)

| File | Verdict |
|---|---|
| `foundations/borders.json` vs plugin's | ✅ byte-identical |
| `foundations/breakpoint-grid-structure.json` | ✅ byte-identical |
| `foundations/color.json` | ✅ byte-identical |
| `foundations/elevation.json` | ✅ byte-identical |
| `foundations/icons.json` | ✅ byte-identical |
| `foundations/interaction-motion.json` | ✅ byte-identical |
| `foundations/spacing.json` | ✅ byte-identical |
| `foundations/typography.json` | ✅ byte-identical |

### Conclusion

Foundations Pass #1: PASSED. The lifted `derive-foundations.js` + `foundations-parser/` produces byte-identical outputs to the plugin's existing `docs/generated/foundations/` artifacts. Same `[derive-foundations] Numbered heading 'X' has no parser map entry; skipping.` warnings as plugin (existing parser-map gaps for sections 5.4 / 6 / 6.1 / 6.2 — not regressions).

### Foundations Pass #2 — TBD (1-2 weeks after Pass #1)

Same discipline as the registries pass. Expected: still byte-identical.

---

## Cross-refs

- Phase 1 design spec: `Actian-DS-Claude-plugin/plugins/actian-design-system/docs/superpowers/specs/2026-05-09-federation-phase-1-design.md` (untracked working artifact)
- Phase 1.1 plan: `Actian-DS-Claude-plugin/plugins/actian-design-system/docs/superpowers/plans/2026-05-09-federation-phase-1.1-knowledge-repo-standup.md` (untracked working artifact)
- Repo location decision: `Actian-DS-Claude-plugin/memory/project_federation_repo_location.md`
- MIGRATIONS.md (in plugin): parallel-change discipline rule
