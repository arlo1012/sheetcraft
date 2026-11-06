<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Input } from "tdesign-vue-next/es/input";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Textarea } from "tdesign-vue-next/es/textarea";
import { Select } from "tdesign-vue-next/es/select";
import type { SheetControlDrawing } from "@sheetcraft/core/sheet-drawings";
import type { FormControlType } from "@sheetcraft/core/form-controls";
import { useAppI18n } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { formatRangeReference } from "../../../shared/range-reference/formatRangeReference";
const props = defineProps<{
  drawing: SheetControlDrawing;
  sheetName: string;
  disabled: boolean;
  error: boolean;
  suspended: boolean;
  selectReference: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  confirm: [drawing: SheetControlDrawing, linked: string, source: string];
  close: [];
}>();
const { t } = useAppI18n();
const draft = ref({
  ...props.drawing,
  control: { ...props.drawing.control, items: [...props.drawing.control.items] },
});
const linked = ref(
  props.drawing.control.linkedCell
    ? formatRangeReference(props.sheetName, {
        start: props.drawing.control.linkedCell,
        end: props.drawing.control.linkedCell,
      })
    : "",
);
const source = ref(
  props.drawing.control.source
    ? formatRangeReference(props.sheetName, props.drawing.control.source)
    : "",
);
const items = ref(props.drawing.control.items.join("\n"));
type ResetValueType = "empty" | "text" | "number" | "boolean";
const initialReset = props.drawing.control.resetValue;
const resetType = ref<ResetValueType>(
  initialReset === null
    ? "empty"
    : typeof initialReset === "string"
      ? "text"
      : typeof initialReset === "number"
        ? "number"
        : "boolean",
);
const resetText = ref(typeof initialReset === "string" ? initialReset : "");
const resetNumber = ref<number | undefined>(typeof initialReset === "number" ? initialReset : 0);
const resetBoolean = ref(typeof initialReset === "boolean" ? initialReset : false);
const resetTypeOptions = computed(() => [
  { value: "text", label: t("control.valueText") },
  { value: "number", label: t("control.valueNumber") },
  { value: "boolean", label: t("control.valueBoolean") },
  { value: "empty", label: t("control.valueEmpty") },
]);
const types: FormControlType[] = [
  "checkbox",
  "radio",
  "combo",
  "list",
  "spinner",
  "scrollbar",
  "button",
  "label",
  "group",
];
const options = computed(() => types.map((value) => ({ label: t(`control.${value}`), value })));
const numeric = computed(
  () => draft.value.control.type === "spinner" || draft.value.control.type === "scrollbar",
);
const localError = computed(() => {
  const control = draft.value.control;
  if (
    numeric.value &&
    (!Number.isFinite(control.min) || !Number.isFinite(control.max) || control.min > control.max)
  )
    return t("control.invalidBounds");
  if (numeric.value && (!Number.isFinite(control.step) || control.step <= 0))
    return t("control.invalidStep");
  if (control.type === "radio" && !Number.isFinite(control.optionValue))
    return t("control.invalidOptionValue");
  if (
    control.type === "button" &&
    resetType.value === "number" &&
    (typeof resetNumber.value !== "number" || !Number.isFinite(resetNumber.value))
  )
    return t("control.invalidResetNumber");
  return "";
});
watch(
  () => draft.value.control.type,
  (type, previous) => {
    if (draft.value.name === t(`control.${previous}`)) draft.value.name = t(`control.${type}`);
    if (draft.value.control.label === t(`control.${previous}`))
      draft.value.control.label = t(`control.${type}`);
  },
);
function confirm() {
  if (props.disabled || localError.value) return;
  const resetValue =
    resetType.value === "text"
      ? resetText.value
      : resetType.value === "number"
        ? resetNumber.value!
        : resetType.value === "boolean"
          ? resetBoolean.value
          : null;
  emit(
    "confirm",
    {
      ...draft.value,
      control: {
        ...draft.value.control,
        min: numeric.value ? draft.value.control.min : 0,
        max: numeric.value ? draft.value.control.max : 100,
        step: numeric.value ? draft.value.control.step : 1,
        optionValue: draft.value.control.type === "radio" ? draft.value.control.optionValue : 1,
        items: items.value ? items.value.split(/\r?\n/) : [],
        resetValue: draft.value.control.type === "button" ? resetValue : null,
      },
    },
    linked.value,
    source.value,
  );
}
</script>
<template>
  <Dialog
    :visible="!suspended"
    :header="t('control.title')"
    :aria-label="t('control.title')"
    role="dialog"
    aria-modal="true"
    placement="center"
    width="min(540px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled: disabled || Boolean(localError) }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="emit('close')"
  >
    <Form class="form-control-editor sheetcraft-form-grid" label-align="top" :data="draft">
      <FormItem :label="t('control.type')">
        <Select v-model="draft.control.type" :options="options" :aria-label="t('control.type')" />
      </FormItem>
      <div class="form-control-editor__names">
        <FormItem :label="t('drawing.name')"
          ><Input v-model="draft.name" :maxlength="200" :aria-label="t('drawing.name')"
        /></FormItem>
        <FormItem :label="t('control.labelText')"
          ><Input
            v-model="draft.control.label"
            :maxlength="1000"
            :aria-label="t('control.labelText')"
        /></FormItem>
      </div>
      <FormItem
        v-if="draft.control.type !== 'label' && draft.control.type !== 'group'"
        :label="t('control.linked')"
      >
        <RangeReferenceInput
          v-model="linked"
          :label="t('control.linked')"
          :select-reference="selectReference"
        />
      </FormItem>
      <template v-if="draft.control.type === 'combo' || draft.control.type === 'list'">
        <FormItem :label="t('control.source')"
          ><RangeReferenceInput
            v-model="source"
            :label="t('control.source')"
            :select-reference="selectReference"
        /></FormItem>
        <FormItem :label="t('control.items')"
          ><Textarea
            v-model="items"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :aria-label="t('control.items')"
        /></FormItem>
        <p>{{ t("control.listHint") }}</p>
      </template>
      <div v-if="numeric" class="form-control-editor__numbers">
        <FormItem :label="t('control.min')"
          ><InputNumber
            v-model="draft.control.min"
            :aria-label="t('control.min')"
            theme="column"
            class="sheetcraft-input-number--persistent-controls"
        /></FormItem>
        <FormItem :label="t('control.max')"
          ><InputNumber
            v-model="draft.control.max"
            :aria-label="t('control.max')"
            theme="column"
            class="sheetcraft-input-number--persistent-controls"
        /></FormItem>
        <FormItem :label="t('control.step')"
          ><InputNumber
            v-model="draft.control.step"
            :aria-label="t('control.step')"
            :min="0.000001"
            theme="column"
            class="sheetcraft-input-number--persistent-controls"
        /></FormItem>
      </div>
      <FormItem v-if="draft.control.type === 'radio'" :label="t('control.optionValue')"
        ><InputNumber
          v-model="draft.control.optionValue"
          :aria-label="t('control.optionValue')"
          theme="column"
          class="sheetcraft-input-number--persistent-controls"
      /></FormItem>
      <template v-if="draft.control.type === 'button'">
        <FormItem :label="t('control.resetType')">
          <Select
            v-model="resetType"
            :options="resetTypeOptions"
            :aria-label="t('control.resetType')"
          />
        </FormItem>
        <FormItem v-if="resetType !== 'empty'" :label="t('control.resetValue')">
          <Input
            v-if="resetType === 'text'"
            v-model="resetText"
            :maxlength="1000"
            :aria-label="t('control.resetValue')"
          />
          <InputNumber
            v-else-if="resetType === 'number'"
            v-model="resetNumber"
            theme="column"
            class="sheetcraft-input-number--persistent-controls"
            :aria-label="t('control.resetValue')"
          />
          <Select
            v-else
            v-model="resetBoolean"
            :options="[
              { value: true, label: 'TRUE' },
              { value: false, label: 'FALSE' },
            ]"
            :aria-label="t('control.resetValue')"
          />
        </FormItem>
        <p v-else>{{ t("control.emptyValueHint") }}</p>
      </template>
      <p>{{ t("control.hint") }}</p>
      <p v-if="localError || error" role="alert">{{ localError || t("control.invalid") }}</p>
    </Form>
  </Dialog>
</template>
<style scoped lang="scss">
.form-control-editor {
  display: grid;
  gap: var(--sheetcraft-space-3);
  &__names {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sheetcraft-space-2);
  }
  &__numbers {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sheetcraft-space-2);
  }
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
  [role="alert"] {
    color: var(--sheetcraft-status-error);
  }
}
</style>
