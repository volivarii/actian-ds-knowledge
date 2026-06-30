// Radix replacements for @rjsf/core's `form-control` textarea and select.
// enumOptions values are stringified for the Radix Select (which is
// string-valued) and mapped back to their original typed value on change.
import type { WidgetProps, EnumOptionsType } from "@rjsf/utils";
import { TextArea, Select } from "@radix-ui/themes";

export function TextareaWidget(props: WidgetProps) {
  const {
    id,
    value,
    disabled,
    readonly,
    autofocus,
    placeholder,
    onChange,
    onBlur,
    onFocus,
    options,
  } = props;
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
      onChange={(e) =>
        onChange(e.target.value === "" ? options.emptyValue : e.target.value)
      }
      onBlur={(e) => onBlur(id, e.target.value)}
      onFocus={(e) => onFocus(id, e.target.value)}
    />
  );
}

export function SelectWidget(props: WidgetProps) {
  const {
    id,
    value,
    disabled,
    readonly,
    multiple,
    onChange,
    options,
    placeholder,
  } = props;
  const enumOptions = (options.enumOptions ?? []) as EnumOptionsType[];

  // Guard: Radix Select is single-value only. When RJSF routes a multi-select
  // enum field (type: "array" + uniqueItems + items.enum) here, fall back to a
  // native <select multiple> so the widget is functional. Upgrade to a Radix
  // CheckboxGroup if a form needs a styled multi-select.
  if (multiple) {
    const selectedStrings = (Array.isArray(value) ? value : []).map(String);
    return (
      <select
        id={id}
        multiple
        disabled={disabled || readonly}
        value={selectedStrings}
        style={{ width: "100%" }}
        onChange={(e) => {
          const picked = Array.from(e.target.selectedOptions).map((o) => {
            const match = enumOptions.find((x) => String(x.value) === o.value);
            return match ? match.value : o.value;
          });
          onChange(picked);
        }}
      >
        {enumOptions.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

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
      <Select.Trigger
        id={id}
        placeholder={placeholder ?? "Select…"}
        style={{ width: "100%" }}
      />
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
