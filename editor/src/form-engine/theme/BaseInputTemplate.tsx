// Radix TextField replacement for @rjsf/core's `form-control` <input>.
// Mirrors core's empty-value and number handling so behavior is unchanged.
import { useCallback } from "react";
import type { BaseInputTemplateProps } from "@rjsf/utils";
import { getInputProps } from "./rjsfUtils";
import { TextField } from "@radix-ui/themes";

export function BaseInputTemplate(props: BaseInputTemplateProps) {
  const {
    id,
    value,
    readonly,
    disabled,
    autofocus,
    onBlur,
    onFocus,
    onChange,
    options,
    schema,
    type,
    placeholder,
    required,
  } = props;

  const inputProps = getInputProps(schema, type, options);
  const isNumber = inputProps.type === "number" || inputProps.type === "integer";
  const inputValue = isNumber ? (value || value === 0 ? value : "") : value == null ? "" : value;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange(e.target.value === "" ? options.emptyValue : e.target.value),
    [onChange, options],
  );

  return (
    <TextField.Root
      id={id}
      type={inputProps.type as React.ComponentProps<typeof TextField.Root>["type"]}
      value={inputValue as string | number}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readonly}
      autoFocus={autofocus}
      required={required}
      size="2"
      min={inputProps.min as number | undefined}
      max={inputProps.max as number | undefined}
      step={inputProps.step as number | undefined}
      onChange={handleChange}
      onBlur={(e) => onBlur(id, e.target.value)}
      onFocus={(e) => onFocus(id, e.target.value)}
      style={{ width: "100%" }}
    />
  );
}
