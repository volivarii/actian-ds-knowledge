// Radix-themed RJSF button templates. Replaces @rjsf/core's Bootstrap
// `btn`/`glyphicon` buttons (which render as empty gray boxes because the app
// never loads Bootstrap/glyphicon CSS). Icons are text glyphs, matching the
// existing RefArrayWidget idiom. Every icon button carries an aria-label so the
// controls are keyboard- and screen-reader-usable.
import type { IconButtonProps } from "@rjsf/utils";
import { Button, IconButton } from "@radix-ui/themes";
import { getUiOptions } from "./rjsfUtils";

export function AddButton({ onClick, disabled, uiSchema }: IconButtonProps) {
  // ui:options.addLabel lets a uiSchema name the item (e.g. "use case") so the
  // button reads "+ Add use case". Defaults to a bare "+ Add".
  const opts = getUiOptions(uiSchema as Record<string, unknown>);
  const noun = typeof opts.addLabel === "string" ? opts.addLabel : "";
  return (
    <Button
      type="button"
      variant="soft"
      size="1"
      onClick={onClick}
      disabled={disabled}
      mt="1"
    >
      {`+ Add${noun ? ` ${noun}` : ""}`}
    </Button>
  );
}

export function MoveUpButton({ onClick, disabled }: IconButtonProps) {
  return (
    <IconButton
      type="button"
      variant="ghost"
      size="1"
      color="gray"
      aria-label="Move up"
      onClick={onClick}
      disabled={disabled}
    >
      ↑
    </IconButton>
  );
}

export function MoveDownButton({ onClick, disabled }: IconButtonProps) {
  return (
    <IconButton
      type="button"
      variant="ghost"
      size="1"
      color="gray"
      aria-label="Move down"
      onClick={onClick}
      disabled={disabled}
    >
      ↓
    </IconButton>
  );
}

export function RemoveButton({ onClick, disabled }: IconButtonProps) {
  return (
    <IconButton
      type="button"
      variant="ghost"
      size="1"
      color="red"
      aria-label="Remove"
      onClick={onClick}
      disabled={disabled}
    >
      ✕
    </IconButton>
  );
}
