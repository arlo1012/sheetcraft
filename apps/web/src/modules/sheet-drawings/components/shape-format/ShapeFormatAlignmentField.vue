<script setup lang="ts">
import { computed } from "vue";
import FormatField from "../../../../shared/format-pane/FormatField.vue";
import TextAlignmentToggleGroup from "../../../../shared/text-format/TextAlignmentToggleGroup.vue";
import type { ShapeFormatValues } from "../../shape-format-pane-model";
import { getShapeAlignmentOptions } from "./shape-alignment-options";
import type { ShapeFormatController } from "./useShapeFormatPane";

const props = defineProps<{
  controller: ShapeFormatController;
  field: "paragraphAlignment" | "textVerticalAlignment";
}>();

const capability = computed(() => props.controller.fieldCapability(props.field));
const mixed = computed(() => props.controller.isMixedField(props.field));
const value = computed(() =>
  mixed.value ? undefined : props.controller.props.snapshot?.values[props.field],
);
const options = computed(() => getShapeAlignmentOptions(props.controller, props.field));

const action = computed(() => {
  const apply = props.controller.session.fieldAction(props.field);
  return (next: string) => {
    if (options.value.some((option) => option.value === next)) {
      apply(next as ShapeFormatValues[typeof props.field]);
    }
  };
});
</script>

<template>
  <FormatField
    :label="controller.fieldLabel(field)"
    :reason="capability.enabled ? undefined : capability.reason"
    :data-shape-format-field="field"
  >
    <TextAlignmentToggleGroup
      variant="field"
      history-control="discrete"
      :options="options"
      :model-value="value"
      :mixed="mixed"
      :disabled="!capability.enabled"
      :label="controller.fieldLabel(field)"
      @select="action"
    />
  </FormatField>
</template>
