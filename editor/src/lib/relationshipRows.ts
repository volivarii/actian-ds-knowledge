/**
 * The entity `relationships` map, as rows a person edits.
 *
 * Stored shape is a verb keyed to a LIST of target slugs, because one verb
 * routinely has several targets: a catalog object contains seven things. That
 * shape is right for the substrate and wrong for a form, where an author adds
 * one relationship at a time. These two functions are the whole translation,
 * kept pure so the rules can be tested without mounting anything.
 */

export interface RelationshipRow {
  verb: string;
  target: string;
}

/** Stored map -> rows, in the map's own order. A bare string value is read as
 *  a single target rather than skipped: a record still in the old shape must
 *  render, not vanish from the form it is being edited in. */
export function rowsFromMap(value: unknown): RelationshipRow[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rows: RelationshipRow[] = [];
  for (const [verb, raw] of Object.entries(value as Record<string, unknown>)) {
    const targets = Array.isArray(raw) ? raw : [raw];
    for (const target of targets) {
      if (typeof target === "string" && target) rows.push({ verb, target });
    }
  }
  return rows;
}

/**
 * Rows -> stored map, grouping by verb in first-appearance order.
 *
 * Drops incomplete rows (a verb with no target yet, the state every new row
 * starts in) and repeated pairs, so an author cannot save a half-typed row or
 * assert the same thing twice. Both would pass the schema and both are
 * meaningless.
 */
export function mapFromRows(
  rows: readonly RelationshipRow[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const { verb, target } of rows) {
    if (!verb || !target) continue;
    const targets = (out[verb] ??= []);
    if (!targets.includes(target)) targets.push(target);
  }
  return out;
}

/** The vocabulary a schema declares, or [] when it declares none. Read from
 *  `propertyNames.enum` so the form and the schema cannot disagree about what
 *  the verbs are. */
export function verbsFromSchema(schema: unknown): string[] {
  const names = (schema as { propertyNames?: { enum?: unknown } } | null)
    ?.propertyNames?.enum;
  return Array.isArray(names)
    ? names.filter((v): v is string => typeof v === "string")
    : [];
}
