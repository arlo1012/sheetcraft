<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { useNativePopupOwnership } from "../../../../shared/floating/useNativePopupOwnership";
import { vNativeControl } from "../../../../shared/tdesign/native-control";
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
const root = ref<InstanceType<typeof PictureFormatField>>();
const popup = useNativePopupOwnership({
  owner: () =>
    props.controller.props.snapshot
      ? `${props.controller.ownerKey.value}:${props.field}`
      : undefined,
  disabled: () => !capability.value.enabled,
  root: () => root.value?.$el,
});
const popupHost = popup.host;
const inputId = `shape-format-choice-${useId()}`;
const nativeControl = computed(() => ({
  attributes: {
    id: inputId,
    role: "combobox",
    "aria-label": props.controller.fieldLabel(props.field),
    "aria-expanded": String(popup.visible.value),
    "data-format-pane-history-control": "readonly-combobox",
  },
}));
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
  if (props.field === "textVerticalAlignment") {
    const values = c.props.snapshot?.values;
    if (c.isMixedField("textDirection") || c.isMixedField("textLineOrder"))
      return [
        { value: "top", label: s("blockStart") },
        { value: "middle", label: s("center") },
        { value: "bottom", label: s("blockEnd") },
      ];
    const direction = values?.textDirection ?? "horizontal";
    if (direction === "horizontal")
      return [
        { value: "top", label: s("top") },
        { value: "middle", label: s("middle") },
        { value: "bottom", label: s("bottom") },
      ];
    const startsAtLeft =
      direction === "vertical-lr" ||
      direction === "rotate-270" ||
      (direction === "stacked" && values?.textLineOrder === "ltr");
    return [
      { value: "top", label: s(startsAtLeft ? "blockLeft" : "blockRight") },
      { value: "middle", label: s("center") },
      { value: "bottom", label: s(startsAtLeft ? "blockRight" : "blockLeft") },
    ];
  }
  if (props.field === "textDirection")
    return [
      { value: "horizontal", label: s("horizontal") },
      { value: "vertical-rl", label: s("verticalRightToLeft") },
      { value: "vertical-lr", label: s("verticalLeftToRight") },
      { value: "rotate-90", label: s("rotate90") },
      { value: "rotate-270", label: s("rotate270") },
      { value: "stacked", label: s("stacked") },
    ];
  if (props.field === "textLineOrder")
    return [
      { value: "rtl", label: s("rightToLeft") },
      { value: "ltr", label: s("leftToRight") },
    ];
  if (props.field === "paragraphLineSpacing")
    return [
      { value: "normal", label: s("lineSpacingNormal") },
      { value: "exact", label: s("lineSpacingExact") },
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
    ref="root"
    :label="controller.fieldLabel(field)"
    :reason="capability.enabled ? undefined : capability.reason"
    :data-shape-format-field="field"
  >
    <Teleport to="body"><div ref="popupHost" :data-shape-format-choice-popup="field" /></Teleport>
    <TSelect
      v-native-control="nativeControl"
      :popup-visible="popup.visible.value"
      :popup-props="popup.popupProps"
      @popup-visible-change="popup.onVisibleChange.value"
      :model-value="
        controller.isMixedField(field) ? '' : (controller.props.snapshot?.values[field] ?? '')
      "
      :placeholder="controller.isMixedField(field) ? controller.s.value('mixedValues') : undefined"
      :options="[...options]"
      :disabled="!capability.enabled"
      size="small"
      :aria-label="controller.fieldLabel(field)"
      :onChange="action"
    />
  </PictureFormatField>
</template>
