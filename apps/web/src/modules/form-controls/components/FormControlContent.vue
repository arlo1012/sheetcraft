<script setup lang="ts">
import { computed } from "vue";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Radio } from "tdesign-vue-next/es/radio";
import { Select } from "tdesign-vue-next/es/select";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Slider } from "tdesign-vue-next/es/slider";
import { Button } from "tdesign-vue-next/es/button";
import { canEditCell } from "@idea10/core";
import { getFormControlItems } from "@idea10/core/form-controls";
import type { SheetControlDrawing } from "@idea10/core/sheet-drawings";
import type { Sheet, SheetEvaluator } from "@idea10/core/workbook";
const props = defineProps<{
  drawing: SheetControlDrawing;
  sheet: Sheet;
  evaluator: SheetEvaluator;
  revision: number;
}>();
const emit = defineEmits<{ change: [value: unknown] }>();
const control = computed(() => props.drawing.control);
const value = computed(() => {
  void props.revision;
  return control.value.linkedCell
    ? props.evaluator.getComputedValue(control.value.linkedCell)
    : null;
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
  return !control.value.linkedCell || !canEditCell(props.sheet, control.value.linkedCell);
});
const number = computed(() => (typeof value.value === "number" ? value.value : control.value.min));
</script>
<template>
  <div class="form-control-content">
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
          :checked="value === control.optionValue"
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
  background: #fff;
  color: #202124;
  pointer-events: auto;
  &__caption {
    font-size: 11px;
    line-height: 18px;
    color: #666;
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
      border: 1px solid #d1d5db;
      background: #fff;
      color: #202124;
    }
  }
  &__label {
    white-space: pre-wrap;
  }
  fieldset {
    flex: 1;
    border: 1px solid #9ca3af;
    margin: 0;
  }
}
</style>
