<script setup lang="ts">
import { computed } from "vue";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Radio } from "tdesign-vue-next/es/radio";
import { Select } from "tdesign-vue-next/es/select";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Slider } from "tdesign-vue-next/es/slider";
import { Button } from "tdesign-vue-next/es/button";
import { canEditCell } from "@sheetcraft/core";
import { canEditShapeObject } from "@sheetcraft/core/shape-protection";
import { getFormControlItems, getFormControlValue } from "@sheetcraft/core/form-controls";
import {
  findFormRadioGroup,
  getFormRadioGroups,
  selectedFormRadio,
  type FormRadioGroup,
} from "@sheetcraft/core/form-radio-groups";
import type { SheetControlDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
const props = defineProps<{
  drawing: SheetControlDrawing;
  radioGroup?: FormRadioGroup;
  sheet: Sheet;
  resolveSheet?: (id: string) => Sheet | undefined;
  evaluator: SheetEvaluator;
  revision: number;
}>();
const emit = defineEmits<{ change: [value: unknown] }>();
const control = computed(() => props.drawing.control);
const radioGroup = computed(() => {
  void props.revision;
  return control.value.type === "radio"
    ? (props.radioGroup ?? findFormRadioGroup(getFormRadioGroups(props.sheet), props.drawing.id))
    : undefined;
});
const radioChecked = computed(() => {
  void props.revision;
  return (
    !!radioGroup.value && selectedFormRadio(radioGroup.value, props.evaluator) === props.drawing.id
  );
});
const value = computed(() => {
  void props.revision;
  return getFormControlValue(control.value, props.evaluator);
});
const options = computed(() => {
  void props.revision;
  return getFormControlItems(control.value, props.evaluator).map((label, index) => ({
    label,
    value: index + 1,
  }));
});
const disabled = computed(() => {
  void props.revision;
  const linkedCell = radioGroup.value ? radioGroup.value.linkedCell : control.value.linkedCell;
  const linkedSheetId = radioGroup.value
    ? radioGroup.value.linkedSheetId
    : control.value.linkedSheetId;
  const linkedSheet =
    linkedSheetId && linkedSheetId !== props.sheet.id
      ? props.resolveSheet?.(linkedSheetId)
      : props.sheet;
  if (!linkedSheet || (linkedSheetId && !linkedCell)) return true;
  return linkedCell
    ? !canEditCell(linkedSheet, linkedCell)
    : control.value.type === "button" || !canEditShapeObject(props.sheet, props.drawing);
});
const number = computed(() => (typeof value.value === "number" ? value.value : control.value.min));
function scrollByKey(event: KeyboardEvent) {
  const { min, max, step } = control.value;
  const current = number.value;
  const targets: Record<string, number> = {
    ArrowRight: current + step,
    ArrowUp: current + step,
    ArrowLeft: current - step,
    ArrowDown: current - step,
    Home: min,
    End: max,
    PageUp: current + 10,
    PageDown: current - 10,
  };
  const target = targets[event.key];
  if (disabled.value || target === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  emit("change", Math.min(max, Math.max(min, target)));
}
</script>
<template>
  <div
    class="form-control-content"
    :class="{
      'form-control-content--radio': control.type === 'radio',
      'form-control-content--group': control.type === 'group',
    }"
  >
    <fieldset v-if="control.type === 'group'">
      <legend>{{ control.label }}</legend>
    </fieldset>
    <span v-else-if="control.type === 'label'" class="form-control-content__label">{{
      control.label
    }}</span>
    <template v-else
      ><span class="form-control-content__caption">{{ drawing.name }}</span>
      <div
        class="form-control-content__input"
        data-form-interaction
        @pointerdown.stop
        @dblclick.stop
        @keydown.stop
      >
        <Checkbox
          v-if="control.type === 'checkbox'"
          :checked="value === true"
          :disabled="disabled"
          @change="emit('change', $event)"
          >{{ control.label }}</Checkbox
        >
        <Radio
          v-else-if="control.type === 'radio'"
          :checked="radioChecked"
          :disabled="disabled"
          @change="emit('change', control.optionValue)"
          >{{ control.label }}</Radio
        >
        <Select
          v-else-if="control.type === 'combo'"
          :value="typeof value === 'number' ? value : undefined"
          :options="options"
          :disabled="disabled"
          :placeholder="control.label"
          @change="emit('change', $event)"
        />
        <select
          v-else-if="control.type === 'list'"
          :id="`form-control-list-${drawing.id}`"
          :name="`form-control-list-${drawing.id}`"
          :value="value"
          :disabled="disabled"
          :aria-label="control.label"
          :size="Math.max(2, Math.min(6, options.length))"
          @change="emit('change', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="option in options" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <InputNumber
          v-else-if="control.type === 'spinner'"
          theme="column"
          class="sheetcraft-input-number--persistent-controls"
          :model-value="number"
          :min="control.min"
          :max="control.max"
          :step="control.step"
          :disabled="disabled"
          :aria-label="control.label"
          @change="emit('change', $event)"
        />
        <Slider
          v-else-if="control.type === 'scrollbar'"
          :value="number"
          :min="control.min"
          :max="control.max"
          :step="control.step"
          :disabled="disabled"
          :aria-label="control.label"
          @keydown.capture="scrollByKey"
          @change-end="emit('change', $event)"
        />
        <Button
          v-else-if="control.type === 'button'"
          size="small"
          :disabled="disabled"
          @click="emit('change', control.resetValue)"
          >{{ control.label }}</Button
        >
      </div></template
    >
  </div>
</template>
<style scoped lang="scss">
.form-control-content {
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 4px 8px;
  border: 1px solid var(--sheetcraft-border-subtle);
  border-radius: var(--sheetcraft-radius-default);
  background: var(--sheetcraft-surface-panel);
  &--radio {
    border: 0;
    background: transparent;
  }
  &--group {
    border: 0;
  }
  color: var(--sheetcraft-text-primary);
  pointer-events: auto;
  &__caption {
    font-size: 12px;
    line-height: 18px;
    color: var(--sheetcraft-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: move;
  }
  &__input {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    cursor: default;
    select {
      width: 100%;
      height: 100%;
      border: 1px solid var(--sheetcraft-border-subtle);
      background: var(--sheetcraft-surface-panel);
      color: var(--sheetcraft-text-primary);
    }
  }
  &__label {
    white-space: pre-wrap;
  }
  fieldset {
    flex: 1;
    border: 1px solid var(--sheetcraft-border-control);
    margin: 0;
  }
}
</style>
