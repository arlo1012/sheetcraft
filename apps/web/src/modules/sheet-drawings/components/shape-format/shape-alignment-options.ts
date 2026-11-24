import type { TextAlignmentOption } from "../../../../shared/text-format/TextAlignmentToggleGroup.vue";
import type { ShapeFormatController } from "./useShapeFormatPane";

export function getShapeAlignmentOptions(
  controller: ShapeFormatController,
  field: "paragraphAlignment" | "textVerticalAlignment",
): readonly TextAlignmentOption[] {
  const s = controller.s.value;
  if (field === "paragraphAlignment") {
    return [
      { value: "left", label: s("left"), icon: "left" },
      { value: "center", label: s("center"), icon: "center" },
      { value: "right", label: s("right"), icon: "right" },
      { value: "justify", label: s("justify"), icon: "justify" },
    ];
  }
  const values = controller.props.snapshot?.values;
  if (controller.isMixedField("textDirection") || controller.isMixedField("textLineOrder")) {
    return [
      { value: "top", label: s("blockStart"), icon: "top" },
      { value: "middle", label: s("center"), icon: "middle" },
      { value: "bottom", label: s("blockEnd"), icon: "bottom" },
    ];
  }
  const direction = values?.textDirection ?? "horizontal";
  if (direction === "horizontal") {
    return [
      { value: "top", label: s("top"), icon: "top" },
      { value: "middle", label: s("middle"), icon: "middle" },
      { value: "bottom", label: s("bottom"), icon: "bottom" },
    ];
  }
  const startsAtLeft =
    direction === "vertical-lr" ||
    direction === "rotate-270" ||
    (direction === "stacked" && values?.textLineOrder === "ltr");
  return startsAtLeft
    ? [
        { value: "top", label: s("blockLeft"), icon: "left" },
        { value: "middle", label: s("center"), icon: "center" },
        { value: "bottom", label: s("blockRight"), icon: "right" },
      ]
    : [
        { value: "top", label: s("blockRight"), icon: "right" },
        { value: "middle", label: s("center"), icon: "center" },
        { value: "bottom", label: s("blockLeft"), icon: "left" },
      ];
}
