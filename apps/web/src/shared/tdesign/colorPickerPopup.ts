import type { ColorPickerPanelProps } from "tdesign-vue-next/es/color-picker";
import type { PopupProps } from "tdesign-vue-next/es/popup";

export function createColorPickerSelectInputProps(
  attach: NonNullable<PopupProps["attach"]>,
): NonNullable<ColorPickerPanelProps["selectInputProps"]> {
  return {
    popupProps: {
      attach,
      // TDesign 1.20.7 replaces Select's popupProps at the SelectInput boundary.
      // Retain its built-in menu classes when changing the attachment target.
      overlayClassName: ["t-select__dropdown", "t-color-picker__select-options"],
    },
  };
}
