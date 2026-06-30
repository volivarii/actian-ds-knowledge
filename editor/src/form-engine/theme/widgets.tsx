// Radix replacements for @rjsf/core's `form-control` textarea and select.
// enumOptions values are stringified for the Radix Select (which is
// string-valued) and mapped back to their original typed value on change.
import type { WidgetProps, EnumOptionsType } from "@rjsf/utils";
import { TextArea, Select } from "@radix-ui/themes";

export function TextareaWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, autofocus, placeholder, onChange, onBlur, onFocus, options } = props;
  const rows = typeof options.rows === "number" ? options.rows : 4;
  return (
    <TextArea
      id={id}
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readonly}
      autoFocus={autofocus}
      rows={rows}
      style={{ width: "100%" }}
      onChange={(e) => onChange(e.target.value === "" ? options.emptyValue : e.target.value)}
      onBlur={(e) => onBlur(id, e.target.value)}
      onFocus={(e) => onFocus(id, e.target.value)}
    />
  );
}

export function SelectWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, onChange, options, placeholder } = props;
  const enumOptions = (options.enumOptions ?? []) as EnumOptionsType[];
  const current = value == null || value === "" ? undefined : String(value);
  return (
    <Select.Root
      value={current}
      disabled={disabled || readonly}
      onValueChange={(v) => {
        const match = enumOptions.find((o) => String(o.value) === v);
        onChange(match ? match.value : v);
      }}
    >
      <Select.Trigger id={id} placeholder={placeholder ?? "Select..."} style={{ width: "100%" }} />
      <Select.Content>
        {enumOptions.map((o) => (
          <Select.Item key={String(o.value)} value={String(o.value)}>
            {o.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}
