/**
 * RJSF field for an entity's `relationships`.
 *
 * Replaces a raw map editor in which both halves of a relationship were free
 * text. That is finding F8: typing offered no verbs and no targets, and an
 * invented target drew no error at all, so an author learned it was wrong when
 * CI failed on the pull request they had already opened.
 *
 * Both halves now come from a list. The verb list is the schema's own
 * `propertyNames.enum`, so the form cannot drift from what the schema accepts.
 * The target list is the entity set from the baked graph, which is exactly what
 * `validate-app-context.js` checks against, so an unknown target is refused
 * here rather than in CI.
 *
 * A verb that is not in the vocabulary is still shown and still saved, marked
 * as new. Refusing it outright would leave an author stuck at six in the
 * evening with no way to say a true thing; marking it means introducing one is
 * possible and never accidental.
 */
import { useEffect, useMemo, useState } from "react";
import type { FieldProps } from "@rjsf/utils";
import { Badge, Box, Button, Flex, Select, Text } from "@radix-ui/themes";
import {
  rowsFromMap,
  mapFromRows,
  verbsFromSchema,
  type RelationshipRow,
} from "../../lib/relationshipRows";
import { listEntities } from "../../lib/contextRecords";

export function RelationshipsField(props: FieldProps) {
  const { formData, onChange, schema, disabled, readonly, idSchema } = props;
  const locked = disabled || readonly;

  // Rows are local state, not derived from formData. A row an author has just
  // added has a verb and no target yet, and `mapFromRows` drops it on purpose,
  // so deriving would delete the new row the instant it appeared.
  const [rows, setRows] = useState<RelationshipRow[]>(() =>
    rowsFromMap(formData),
  );
  // Adopt formData only when it says something our own rows do not, which is
  // how a change from elsewhere (switching files, a form reset) arrives. Our
  // own commits round-trip to exactly what we already hold, so an in-progress
  // row survives them.
  useEffect(() => {
    const committed = JSON.stringify(mapFromRows(rows));
    const incoming = JSON.stringify(formData ?? {});
    if (committed !== incoming) setRows(rowsFromMap(formData));
    // `rows` is deliberately not a dependency: this reacts to the value
    // arriving from outside, and reading the current rows to compare is not
    // the same as re-running whenever they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);
  const verbs = useMemo(() => verbsFromSchema(schema), [schema]);
  const entities = useMemo(() => listEntities(), []);
  const known = useMemo(
    () => new Set(entities.map((e) => e.slug)),
    [entities],
  );
  const id = idSchema?.$id ?? "relationships";

  const commit = (next: RelationshipRow[]) => {
    setRows(next);
    onChange(mapFromRows(next));
  };
  const update = (i: number, patch: Partial<RelationshipRow>) =>
    commit(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <Box>
      <Text as="div" size="2" weight="medium" mb="1">
        Relationships
      </Text>
      <Text as="div" size="1" color="gray" mb="2">
        What this entity is to another one. Both halves come from a list, so a
        target that does not exist cannot be saved.
      </Text>

      {rows.length === 0 && (
        <Text as="div" size="1" color="gray" mb="2">
          None yet.
        </Text>
      )}

      <Flex direction="column" gap="2">
        {rows.map((row, i) => {
          const newVerb = verbs.length > 0 && !verbs.includes(row.verb);
          // An incomplete row is not a WRONG row: a target not chosen yet must
          // not be reported as an error the author has made.
          const missingTarget = !!row.target && !known.has(row.target);
          return (
            // The index, not the row's own content: a content key changes on
            // every selection, so the row unmounts mid-change and Radix
            // restores focus to a trigger that no longer exists. Rows are only
            // appended, patched in place, or removed, so the index is stable.
            <Flex key={i} gap="2" align="center" wrap="wrap">
              <Select.Root
                // "" keeps the control controlled AND shows the placeholder;
                // a sentinel value matches no item, so the trigger renders
                // blank with nothing to tell the author what it wants.
                value={row.verb}
                disabled={locked}
                onValueChange={(v) => update(i, { verb: v })}
              >
                <Select.Trigger
                  aria-label={`Relationship ${i + 1} verb`}
                  placeholder="Verb"
                />
                <Select.Content>
                  {verbs.map((v) => (
                    <Select.Item key={v} value={v}>
                      {v}
                    </Select.Item>
                  ))}
                  {newVerb && row.verb && (
                    <Select.Item value={row.verb}>{row.verb}</Select.Item>
                  )}
                </Select.Content>
              </Select.Root>

              <Select.Root
                value={row.target}
                disabled={locked}
                onValueChange={(v) => update(i, { target: v })}
              >
                <Select.Trigger
                  aria-label={`Relationship ${i + 1} target`}
                  placeholder="Entity"
                />
                <Select.Content>
                  {entities.map((e) => (
                    <Select.Item key={e.slug} value={e.slug}>
                      {e.label}
                    </Select.Item>
                  ))}
                  {/* An unknown target is offered ONLY so the row can show what
                      it currently says. Picking anything else replaces it. */}
                  {missingTarget && row.target && (
                    <Select.Item value={row.target}>{row.target}</Select.Item>
                  )}
                </Select.Content>
              </Select.Root>

              {newVerb && (
                <Badge color="amber" variant="soft">
                  new verb
                </Badge>
              )}
              {missingTarget && (
                <Badge color="red" variant="soft">
                  not in the last published set
                </Badge>
              )}

              <Button
                type="button"
                size="1"
                variant="soft"
                color="gray"
                disabled={locked}
                aria-label={`Remove relationship ${i + 1}`}
                onClick={() => commit(rows.filter((_, k) => k !== i))}
              >
                Remove
              </Button>
            </Flex>
          );
        })}
      </Flex>

      <Button
        type="button"
        size="1"
        variant="soft"
        mt="2"
        id={`${id}-add`}
        disabled={locked}
        onClick={() => commit([...rows, { verb: verbs[0] ?? "", target: "" }])}
      >
        Add relationship
      </Button>
    </Box>
  );
}
