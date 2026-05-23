// Thin wrappers around the `yaml` package. The contract is *semantic*
// round-trip — parse → stringify → parse yields the same JS shape. Whitespace
// or comment churn is acceptable; structural drift is not.
//
// Comments in source YAML are NOT preserved across a round-trip in Phase 1a.
// If/when a per-file `_meta.yml` carries inline guidance, Task 6 will switch
// to the yaml package's CST API to retain them.

import { parse, stringify } from "yaml";

export function parseYaml<T = unknown>(text: string): T {
  return parse(text) as T;
}

export function stringifyYaml(value: unknown): string {
  return stringify(value, { lineWidth: 0 });
}
