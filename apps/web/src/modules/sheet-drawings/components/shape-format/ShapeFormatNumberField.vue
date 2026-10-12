<script setup lang="ts">
import { computed, onUnmounted, useId, watch } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import PicturePaintNumber from "../../../sheet-images/components/format-pane/PicturePaintNumber.vue";
import PictureFormatField from "../../../sheet-images/components/format-pane/PictureFormatField.vue";
import type { PictureFormatLengthUnit } from "../../../sheet-images/picture-format-pane-model";
import {
  isShapeFormatLengthField,
  shapeFormatFromDisplay,
  shapeFormatToDisplay,
  type ShapeFormatNumberField,
} from "../../shape-format-pane-model";
import type { ShapeFormatController } from "./useShapeFormatPane";
import ShapeFormatMixedNumber from "./ShapeFormatMixedNumber.vue";
const props = withDefaults(
  defineProps<{
    controller: ShapeFormatController;
    field: ShapeFormatNumberField;
    unit?: PictureFormatLengthUnit;
  }>(),
  { unit: "pt" },
);
const draftId = useId();
watch(
  () => props.controller.ownerKey.value,
  () => props.controller.setNumericDraft(draftId, false),
);
onUnmounted(() => props.controller.setNumericDraft(draftId, false));
function input() {
  props.controller.setNumericDraft(draftId, true);
}
function escape(event: KeyboardEvent) {
  if (event.key === "Escape") props.controller.setNumericDraft(draftId, false);
}
const capability = computed(() => props.controller.fieldCapability(props.field));
const value = computed(() => props.controller.props.snapshot?.values[props.field]);
const mixed = computed(() => props.controller.isMixedField(props.field));
const binding = computed(() => {
  const c = props.controller,
    field = props.field,
    cap = capability.value,
    unit = props.unit;
  const length = isShapeFormatLengthField(field);
  const display = (value: number) => (length ? shapeFormatToDisplay(value, unit) : value);
  const apply = c.session.fieldAction(field);
  const draftOwnerKey = `${c.ownerKey.value}:${field}:${unit}`;
  return {
    ownerKey: draftOwnerKey,
    value: value.value === undefined || mixed.value ? undefined : display(value.value),
    label: c.fieldLabel(field),
    disabled: !cap.enabled,
    min: cap.min === undefined ? undefined : display(cap.min),
    max: cap.max === undefined ? undefined : display(cap.max),
    unit: length ? unit : field.endsWith("Percent") ? "%" : "°",
    invalidMessage: c.s.value("outOfRange"),
    rejectedMessage: c.s.value("applyRejected"),
    onCommit: (next: number) => {
      const accepted = apply(length ? shapeFormatFromDisplay(next, unit) : next);
      // A retained callback may report stale ownership, but must not mark the
      // newly selected drawing as having an active numeric draft.
      if (`${c.ownerKey.value}:${props.field}:${props.unit}` === draftOwnerKey)
        c.setNumericDraft(draftId, !accepted);
      return accepted;
    },
  };
});
</script>
<template>
  <div :data-shape-format-field="field" @input.capture="input" @keydown.capture="escape">
    <ShapeFormatMixedNumber
      v-if="mixed"
      v-bind="binding"
      :placeholder="controller.s.value('mixedValues')"
    />
    <PicturePaintNumber
      v-else-if="binding.value !== undefined"
      v-bind="binding"
      :value="binding.value"
    />
    <PictureFormatField v-else :label="controller.fieldLabel(field)"
      ><TInput model-value="" disabled size="small" :aria-label="controller.fieldLabel(field)"
    /></PictureFormatField>
    <p v-if="!capability.enabled && capability.reason" class="shape-format-number-reason">
      {{ capability.reason }}
    </p>
  </div>
</template>
<style scoped lang="scss">
.shape-format-number-reason {
  margin: 4px 0 0;
  color: var(--sheetcraft-text-secondary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
</style>
