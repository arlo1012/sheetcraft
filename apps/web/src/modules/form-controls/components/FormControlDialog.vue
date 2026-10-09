<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
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
const reset = ref(String(props.drawing.control.resetValue ?? ""));
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
function confirm() {
  const raw = reset.value;
  const resetValue =
    raw === ""
      ? null
      : raw === "true"
        ? true
        : raw === "false"
          ? false
          : raw.trim() && Number.isFinite(Number(raw))
            ? Number(raw)
            : raw;
  emit(
    "confirm",
    {
      ...draft.value,
      control: {
        ...draft.value.control,
        items: items.value ? items.value.split(/\r?\n/) : [],
        resetValue,
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
    width="540px"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="emit('close')"
    ><div class="form-control-editor">
      <label
        >{{ t("control.type") }}<Select v-model="draft.control.type" :options="options"
      /></label>
      <label>{{ t("drawing.name") }}<Input v-model="draft.name" :maxlength="200" /></label>
      <label
        >{{ t("control.labelText") }}<Input v-model="draft.control.label" :maxlength="1000"
      /></label>
      <label v-if="draft.control.type !== 'label' && draft.control.type !== 'group'"
        >{{ t("control.linked")
        }}<RangeReferenceInput
          v-model="linked"
          :label="t('control.linked')"
          :select-reference="selectReference"
      /></label>
      <template v-if="draft.control.type === 'combo' || draft.control.type === 'list'"
        ><label
          >{{ t("control.source")
          }}<RangeReferenceInput
            v-model="source"
            :label="t('control.source')"
            :select-reference="selectReference" /></label
        ><label
          >{{ t("control.items") }}<Textarea v-model="items" :autosize="{ minRows: 3, maxRows: 6 }"
        /></label>
        <p>{{ t("control.listHint") }}</p></template
      >
      <div
        v-if="draft.control.type === 'spinner' || draft.control.type === 'scrollbar'"
        class="form-control-editor__numbers"
      >
        <label>{{ t("control.min") }}<InputNumber v-model="draft.control.min" /></label
        ><label>{{ t("control.max") }}<InputNumber v-model="draft.control.max" /></label
        ><label
          >{{ t("control.step") }}<InputNumber v-model="draft.control.step" :min="0.000001"
        /></label>
      </div>
      <label v-if="draft.control.type === 'radio'"
        >{{ t("control.optionValue") }}<InputNumber v-model="draft.control.optionValue"
      /></label>
      <label v-if="draft.control.type === 'button'"
        >{{ t("control.resetValue") }}<Input v-model="reset" :maxlength="1000"
      /></label>
      <p>{{ t("control.hint") }}</p>
      <p v-if="error" role="alert">{{ t("control.invalid") }}</p>
    </div></Dialog
  >
</template>
<style scoped lang="scss">
.form-control-editor {
  display: grid;
  gap: 12px;
  label {
    display: grid;
    gap: 5px;
  }
  &__numbers {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  p {
    margin: 0;
    color: var(--text-secondary);
  }
  [role="alert"] {
    color: var(--sheetcraft-status-error);
  }
}
</style>
