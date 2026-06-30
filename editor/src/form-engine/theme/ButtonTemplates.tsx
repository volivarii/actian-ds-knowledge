// Radix-themed RJSF button templates. Replaces @rjsf/core's Bootstrap
// `btn`/`glyphicon` buttons (which render as empty gray boxes because the app
// never loads Bootstrap/glyphicon CSS). Icons are text glyphs, matching the
// existing RefArrayWidget idiom. Every icon button carries an aria-label so the
// controls are keyboard- and screen-reader-usable.
//
// Import note: @rjsf/utils ships CJS (dist/index.js) with no `exports` field.
// Node's ESM runtime can't resolve named exports from CJS via static analysis,
// so we use `* as` and extract at runtime, matching the @rjsf/core pattern in
// RJSFForm.tsx.
import type { IconButtonProps } from "@rjsf/utils";
import * as rjsfUtilsMod from "@rjsf/utils";
import { Button, IconButton } from "@radix-ui/themes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _rjsfUtilsAny = rjsfUtilsMod as any;
const getUiOptions: (uiSchema?: Record<string, unknown>, globalOptions?: Record<string, unknown>) => Record<string, unknown> =
  typeof _rjsfUtilsAny?.getUiOptions === "function"
    ? _rjsfUtilsAny.getUiOptions
    : typeof _rjsfUtilsAny?.default?.getUiOptions === "function"
      ? _rjsfUtilsAny.default.getUiOptions
      : () => ({});

export function AddButton({ onClick, disabled, uiSchema }: IconButtonProps) {
  // ui:options.addLabel lets a uiSchema name the item (e.g. "use case") so the
  // button reads "+ Add use case". Defaults to a bare "+ Add".
  const opts = getUiOptions(uiSchema as Record<string, unknown>);
  const noun = typeof opts.addLabel === "string" ? opts.addLabel : "";
  return (
    <Button type="button" variant="soft" size="1" onClick={onClick} disabled={disabled} mt="1">
      {`+ Add${noun ? ` ${noun}` : ""}`}
    </Button>
  );
}

export function MoveUpButton({ onClick, disabled }: IconButtonProps) {
  return (
    <IconButton type="button" variant="ghost" size="1" color="gray" aria-label="Move up" onClick={onClick} disabled={disabled}>
      ↑
    </IconButton>
  );
}

export function MoveDownButton({ onClick, disabled }: IconButtonProps) {
  return (
    <IconButton type="button" variant="ghost" size="1" color="gray" aria-label="Move down" onClick={onClick} disabled={disabled}>
      ↓
    </IconButton>
  );
}

export function RemoveButton({ onClick, disabled }: IconButtonProps) {
  return (
    <IconButton type="button" variant="ghost" size="1" color="red" aria-label="Remove" onClick={onClick} disabled={disabled}>
      ✕
    </IconButton>
  );
}
