<script setup lang="ts">
import { computed } from "vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import PictureFormatField from "../../../sheet-images/components/format-pane/PictureFormatField.vue";
import type {
  ShapeFormatChoiceField,
  ShapeFormatOption,
  ShapeFormatValues,
} from "../../shape-format-pane-model";
import type { ShapeFormatController } from "./useShapeFormatPane";
const props = defineProps<{ controller: ShapeFormatController; field: ShapeFormatChoiceField }>();
const capability = computed(() => props.controller.fieldCapability(props.field));
const options = computed<readonly ShapeFormatOption[]>(() => {
  const c = props.controller,
    s = c.s.value;
  if (c.props.options?.[props.field]) return c.props.options[props.field]!;
  if (props.field === "anchor")
    return [
      { value: "move-size", label: c.props.t("anchorMoveSize") },
      { value: "move", label: c.props.t("anchorMove") },
      { value: "fixed", label: c.props.t("anchorFixed") },
    ];
  if (props.field === "textVerticalAlignment")
    return [
      { value: "top", label: s("top") },
      { value: "middle", label: s("middle") },
      { value: "bottom", label: s("bottom") },
    ];
  if (props.field === "textDirection")
    return [
      { value: "horizontal", label: s("horizontal") },
      { value: "vertical", label: s("vertical") },
      { value: "rotate-90", label: s("rotate90") },
      { value: "rotate-270", label: s("rotate270") },
    ];
  return [
    { value: "left", label: s("left") },
    { value: "center", label: s("center") },
    { value: "right", label: s("right") },
    { value: "justify", label: s("justify") },
  ];
});
const action = computed(() => {
  const apply = props.controller.session.fieldAction(props.field),
    choices = options.value;
  return (value: unknown) =>
    typeof value === "string" &&
    choices.some((option) => option.value === value && !option.disabled) &&
    apply(value as ShapeFormatValues[ShapeFormatChoiceField]);
});
</script>
<template>
  <PictureFormatField
    :label="controller.fieldLabel(field)"
    :reason="capability.enabled ? undefined : capability.reason"
    :data-shape-format-field="field"
  >
    <TSelect
      :model-value="controller.props.snapshot?.values[field]"
      :options="[...options]"
      :disabled="!capability.enabled"
      size="small"
      :aria-label="controller.fieldLabel(field)"
      :onChange="action"
    />
  </PictureFormatField>
</template>
