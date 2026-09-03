// A group of Meters — the whole rendering contract of the completeness model.
//
// Rule 1: the pair, never a bare percentage. There is no percentage to render,
//         because Meter does not carry one.
// Rule 2: the date it was measured, stated once per group.
// Rule 4: a full Meter is DIMMED, not hidden — a measure that disappears when
//         healthy cannot be seen to regress.
//
// `data-complete` is a real styling hook, not a test-only attribute: the rule
// that dims a complete row lives in base.css keyed on
// `.meter-row[data-complete="true"]`. That matters — while the dimming was an
// inline `opacity`, the test asserting "dimmed, not hidden" only read the
// attribute, so deleting the styling left complete Meters looking identical to
// incomplete ones with the gate still green.

import { Box, Flex, Heading, Text, Tooltip } from "@radix-ui/themes";
import type { Meter } from "../lib/measure";

export interface MeterListProps {
  /** Stable id for this group, used to namespace `data-meter`. */
  groupKey: string;
  title: string;
  meters: Meter[];
  /**
   * Show "measured <date>" beside the title. Default true, so a MeterList used
   * on its own always satisfies rule 2.
   *
   * A caller rendering SEVERAL groups from one measurement sets this false and
   * states the date once for the row. Four identical stamps across four
   * columns measured at the same instant is noise, and it reads as four
   * separate measurements that happen to agree.
   */
  showDate?: boolean;
}

export function MeterList({
  groupKey,
  title,
  meters,
  showDate = true,
}: MeterListProps) {
  const measuredAt = showDate ? meters[0]?.measuredAt : undefined;
  return (
    <Box>
      <Flex align="baseline" gap="2" mb="2">
        <Heading size="3">{title}</Heading>
        {measuredAt && (
          <Text size="1" color="gray">
            measured {measuredAt}
          </Text>
        )}
      </Flex>
      <Flex direction="column" gap="1">
        {meters.map((m) => (
          <Flex
            key={m.key}
            className="meter-row"
            // Namespaced by group: `rule` is a Slot of both Pattern and Term,
            // and `used_in` of both Pattern and Entity, so four MeterLists in
            // one container gave `[data-meter="rule"]` two matches and
            // querySelector silently returned the Pattern row.
            data-meter={`${groupKey}:${m.key}`}
            data-complete={m.complete ? "true" : "false"}
            align="center"
            gap="3"
          >
            <Tooltip content={m.help}>
              <Text size="2" style={{ minWidth: "8rem" }}>
                {m.name}
              </Text>
            </Tooltip>
            <Text size="2">
              {m.filled} of {m.total}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}
