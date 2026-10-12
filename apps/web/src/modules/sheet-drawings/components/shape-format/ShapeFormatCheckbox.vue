<script setup lang="ts">
import { computed } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import type { ShapeFormatBooleanField } from "../../shape-format-pane-model";
import type { ShapeFormatController } from "./useShapeFormatPane";
const props = defineProps<{ controller: ShapeFormatController; field: ShapeFormatBooleanField }>();
const capability = computed(() => props.controller.fieldCapability(props.field));
const action = computed(() => {
  const apply = props.controller.session.fieldAction(props.field);
  return (value: unknown) => typeof value === "boolean" && apply(value);
});
</script>
<template>
  <div :data-shape-format-field="field">
    <TCheckbox
      :model-value="
        controller.isMixedField(field) ? false : (controller.props.snapshot?.values[field] ?? false)
      "
      :indeterminate="
        controller.isMixedField(field) || controller.props.snapshot?.values[field] === undefined
      "
      :disabled="!capability.enabled"
      :onChange="action"
      :aria-checked="controller.isMixedField(field) ? 'mixed' : undefined"
      >{{ controller.fieldLabel(field) }}</TCheckbox
    >
    <p v-if="!capability.enabled && capability.reason" class="shape-format-checkbox-reason">
      {{ capability.reason }}
    </p>
  </div>
</template>
<style scoped lang="scss">
.shape-format-checkbox-reason {
  margin: 4px 0 0;
  color: var(--sheetcraft-text-secondary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
</style>
