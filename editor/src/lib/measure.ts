// Roll-up: a set of records plus a Slot table becomes a set of Meters.
//
// A scope IS the array of records passed in. Record scope is one element,
// product scope is a filter, substrate scope is everything — one derivation and
// three renderings, rather than three counts that can disagree.

import type { Slot } from "./slots";
import type { SlotKey } from "./nomenclature";

export interface Meter {
  key: SlotKey;
  name: string;
  filled: number;
  total: number;
  /**
   * Full, and rendered dimmed rather than hidden — a measure that disappears
   * when healthy cannot be seen to regress.
   *
   * An empty scope is NOT complete. 0 of 0 means nothing was measured, and
   * reporting that as done is how a gate comes to mean nothing.
   */
  complete: boolean;
  /** Passed in by the caller, never stamped here. */
  measuredAt: string;
  help: string;
  action: string;
}

// NOTE: there is deliberately no `percent` on Meter, and no helper that
// computes one. A bare ratio is exactly how oracle coverage came to read as
// progress while its numerator sat flat at 78 for three weeks — the pair is the
// honest report, so the type carries only the pair.

export function measure<R>(
  records: readonly R[],
  slots: readonly Slot<R>[],
  measuredAt: string,
): Meter[] {
  return slots.map((slot) => {
    const filled = records.reduce((n, r) => (slot.filled(r) ? n + 1 : n), 0);
    return {
      key: slot.key,
      name: slot.name,
      filled,
      total: records.length,
      complete: records.length > 0 && filled === records.length,
      measuredAt,
      help: slot.help,
      action: slot.action,
    };
  });
}

/** The Slots this record has not filled, in table order — the record-scope
 *  reading of the same data a Meter counts. */
export function emptySlots<R>(
  record: R,
  slots: readonly Slot<R>[],
): Slot<R>[] {
  return slots.filter((s) => !s.filled(record));
}
