import type { FormControlType } from "@idea10/core/form-controls";
import type { SheetControlDrawing } from "@idea10/core/sheet-drawings";
export function controlDrawing(type: FormControlType = "checkbox"): SheetControlDrawing {
  return {
    id: "control",
    kind: "control",
    name: "Choice",
    anchor: { row: 1, column: 1 },
    offsetX: 0,
    offsetY: 0,
    width: 220,
    height: 80,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#000000",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    control: {
      type,
      label: "Choose",
      linkedCell: { row: 0, column: 0 },
      source: null,
      items: ["One", "Two"],
      min: 0,
      max: 10,
      step: 2,
      optionValue: 3,
      resetValue: null,
    },
  };
}
