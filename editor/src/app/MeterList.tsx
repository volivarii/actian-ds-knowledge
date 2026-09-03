// A group of Meters — the whole rendering contract of the completeness model.
//
// Rule 1: the pair, never a bare percentage. There is no percentage to render,
//         because Meter does not carry one.
// Rule 2: the date it was measured, stated once per group.
// Rule 4: a full Meter is DIMMED, not hidden — a measure that disappears when
//         healthy cannot be seen to regress.
//
// `data-complete` sits on the row itself rather than on a wrapper, because a
// test cannot read an inherited computed style: the attribute has to be on the
// element the styling keys off.

import { Box, Flex, Heading, Text, Tooltip } from "@radix-ui/themes";
import type { Meter } from "../lib/measure";

export interface MeterListProps {
  title: string;
  meters: Meter[];
}

export function MeterList({ title, meters }: MeterListProps) {
  const measuredAt = meters[0]?.measuredAt;
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
            data-meter={m.key}
            data-complete={m.complete ? "true" : "false"}
            align="center"
            gap="3"
            style={{ opacity: m.complete ? 0.55 : 1 }}
          >
            <Tooltip content={m.help}>
              <Text size="2" style={{ minWidth: "8rem" }}>
                {m.name}
              </Text>
            </Tooltip>
            <Text size="2" color={m.complete ? "gray" : undefined}>
              {m.filled} of {m.total}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}
