import type React from "react";

/**
 * Wraps a click-equivalent action into a keydown handler so a clickable
 * non-button element (carrying role="button") also responds to Enter and
 * Space, matching native button semantics.
 *
 * Shared rather than copied: RelationsPanel and the Patterns tab both make a
 * span or div activatable, and a second copy is how one of them quietly stops
 * matching the other.
 */
export function onActivateKey(action: (e: React.KeyboardEvent) => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action(e);
    }
  };
}
